import os
import uuid
import json
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional

from infra.logging.structured_logger import get_structured_logger
from infra.database import get_connection

# ChromaDB & Langchain（可选：缺依赖时后端仍可启动，知识库接口返回 503）
try:
    import chromadb
    from langchain_huggingface import HuggingFaceEmbeddings
    from langchain_core.documents import Document
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    _KB_AVAILABLE = True
    _KB_IMPORT_ERROR = ""
except Exception as e:  # pragma: no cover
    chromadb = None  # type: ignore
    HuggingFaceEmbeddings = None  # type: ignore
    Document = None  # type: ignore
    RecursiveCharacterTextSplitter = None  # type: ignore
    _KB_AVAILABLE = False
    _KB_IMPORT_ERROR = str(e)

logger = get_structured_logger("api.routes.knowledge")
router = APIRouter()

# Global ChromaDB client & collection
chroma_client = None
collection = None
embeddings = None


def _require_kb():
    if not _KB_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail=f"知识库不可用：缺少依赖（chromadb / langchain）。请执行 pip install -r requirements.txt。原因: {_KB_IMPORT_ERROR}",
        )


def init_chroma():
    _require_kb()
    global chroma_client, collection, embeddings
    db_path = str(Path(__file__).parent.parent.parent / "database" / "chroma_db")
    os.makedirs(db_path, exist_ok=True)
    
    if chroma_client is None:
        chroma_client = chromadb.PersistentClient(path=db_path)
        
    if embeddings is None:
        # Initialize Embeddings model (will download first time)
        embeddings = HuggingFaceEmbeddings(
            model_name="BAAI/bge-small-zh-v1.5", 
            cache_folder=str(Path(__file__).parent.parent.parent / "database" / "models")
        )
        
    if collection is None:
        # Get or create collection
        collection = chroma_client.get_or_create_collection(
            name="sidea_knowledge_base",
            metadata={"hnsw:space": "cosine"}
        )

# Helper function to parse files
def parse_file(file_path: str, file_type: str) -> str:
    content = ""
    try:
        if file_type == "application/pdf":
            import PyPDF2
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    content += page.extract_text() + "\n"
        elif file_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            import docx
            doc = docx.Document(file_path)
            content = "\n".join([para.text for para in doc.paragraphs])
        elif file_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            import pandas as pd
            df = pd.read_excel(file_path)
            content = df.to_csv(index=False)
        else:
            # Fallback to plain text for logs/txt
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
    except Exception as e:
        logger.error(f"Error parsing file {file_path}: {e}")
    return content

class ExtractRequest(BaseModel):
    session_id: str
    message: str

@router.post("/knowledge/upload")
async def upload_document(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload and process a document into the knowledge base."""
    init_chroma()
    
    doc_id = str(uuid.uuid4())
    upload_dir = Path(__file__).parent.parent.parent / "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = upload_dir / f"{doc_id}_{file.filename}"
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
        
    file_size = len(content)
    
    # Save to database as processing
    with get_connection("config.db") as conn:
        conn.execute(
            """INSERT INTO kb_documents (doc_id, filename, file_type, file_size, status) 
               VALUES (?, ?, ?, ?, 'processing')""",
            (doc_id, file.filename, file.content_type, file_size)
        )
        conn.commit()

    # Background processing
    def process_document(doc_id: str, file_path: str, filename: str, file_type: str):
        try:
            text = parse_file(file_path, file_type)
            if not text.strip():
                raise Exception("Empty document")
                
            splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
            chunks = splitter.split_text(text)
            
            # Create embeddings and store in Chroma
            ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
            metadatas = [{"doc_id": doc_id, "filename": filename} for _ in chunks]
            
            # Compute embeddings
            chunk_embeddings = embeddings.embed_documents(chunks)
            
            collection.add(
                documents=chunks,
                embeddings=chunk_embeddings,
                metadatas=metadatas,
                ids=ids
            )
            
            # Update DB status
            with get_connection("config.db") as conn:
                conn.execute("UPDATE kb_documents SET status = 'completed', chunk_count = ? WHERE doc_id = ?", (len(chunks), doc_id))
                conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to process document {doc_id}: {e}")
            with get_connection("config.db") as conn:
                conn.execute("UPDATE kb_documents SET status = 'failed' WHERE doc_id = ?", (doc_id,))
                conn.commit()

    background_tasks.add_task(process_document, doc_id, str(file_path), file.filename, file.content_type)
    return {"status": "success", "doc_id": doc_id, "message": "Document is being processed"}

@router.get("/knowledge/documents")
def get_documents():
    """Get list of documents in knowledge base."""
    with get_connection("config.db") as conn:
        rows = conn.execute("SELECT * FROM kb_documents ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]

@router.delete("/knowledge/documents/{doc_id}")
def delete_document(doc_id: str):
    """Delete a document and its vectors."""
    init_chroma()
    
    with get_connection("config.db") as conn:
        conn.execute("DELETE FROM kb_documents WHERE doc_id = ?", (doc_id,))
        conn.commit()
        
    try:
        # Delete from Chroma (Chroma metadata filter)
        collection.delete(where={"doc_id": doc_id})
    except Exception as e:
        logger.error(f"Failed to delete vectors for {doc_id}: {e}")
        
    return {"status": "success"}

@router.post("/knowledge/extract")
async def extract_experience(req: ExtractRequest, background_tasks: BackgroundTasks):
    """Extract a high-value conversation rule into the experience queue."""
    exp_id = str(uuid.uuid4())
    
    with get_connection("config.db") as conn:
        conn.execute(
            """INSERT INTO kb_experience_queue (id, session_id, content, extracted_rule, status)
               VALUES (?, ?, ?, ?, 'pending')""",
            (exp_id, req.session_id, req.message, "Waiting for extraction...")
        )
        conn.commit()
        
    # Process extraction in background
    def do_extract(exp_id: str, content: str):
        try:
            from agent.graph import _get_llm
            from infra.config_store import ConfigStore
            from langchain_core.messages import SystemMessage, HumanMessage
            
            config_store = ConfigStore("config.db")
            llm = _get_llm(config_store)
            
            sys_msg = SystemMessage(content="你是资深的工控与半导体专家。请总结用户提供的故障排查记录，提炼出具有高价值的‘故障现象-原因-解决方案’经验规则。尽量精简、专业，去除多余对话。")
            hum_msg = HumanMessage(content=content)
            
            res = llm.invoke([sys_msg, hum_msg])
            raw_rule = getattr(res, "content", "")
            rule = raw_rule if isinstance(raw_rule, str) else " ".join([c.get("text", "") for c in raw_rule if isinstance(c, dict) and "text" in c])
            
            with get_connection("config.db") as conn:
                conn.execute("UPDATE kb_experience_queue SET extracted_rule = ? WHERE id = ?", (rule, exp_id))
                conn.commit()
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
            with get_connection("config.db") as conn:
                conn.execute("UPDATE kb_experience_queue SET status = 'failed' WHERE id = ?", (exp_id,))
                conn.commit()
                
    background_tasks.add_task(do_extract, exp_id, req.message)
    return {"status": "success", "id": exp_id}

@router.get("/knowledge/experiences")
def get_experiences():
    """Get list of experiences in the review queue."""
    with get_connection("config.db") as conn:
        rows = conn.execute("SELECT * FROM kb_experience_queue ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]

class ApproveExperienceRequest(BaseModel):
    action: str # "approve" or "reject"
    edited_rule: Optional[str] = None

@router.post("/knowledge/experiences/{exp_id}/approve")
def approve_experience(exp_id: str, req: ApproveExperienceRequest):
    """Approve and insert experience into the vector DB, or reject it."""
    with get_connection("config.db") as conn:
        exp = conn.execute("SELECT * FROM kb_experience_queue WHERE id = ?", (exp_id,)).fetchone()
        if not exp:
            raise HTTPException(status_code=404, detail="Experience not found")
            
        if req.action == "reject":
            conn.execute("UPDATE kb_experience_queue SET status = 'rejected' WHERE id = ?", (exp_id,))
            conn.commit()
            return {"status": "success"}
            
        # Approve flow
        final_rule = req.edited_rule if req.edited_rule else exp["extracted_rule"]
        conn.execute("UPDATE kb_experience_queue SET status = 'approved', extracted_rule = ? WHERE id = ?", (final_rule, exp_id))
        conn.commit()
        
    # Store into vector DB
    init_chroma()
    doc_id = f"exp_{exp_id}"
    chunk_embedding = embeddings.embed_documents([final_rule])
    collection.add(
        documents=[final_rule],
        embeddings=chunk_embedding,
        metadatas=[{"doc_id": doc_id, "type": "experience"}],
        ids=[doc_id]
    )
    
    return {"status": "success"}

class SearchKBRequest(BaseModel):
    query: str
    limit: Optional[int] = 5

@router.get("/knowledge/chunks")
def get_knowledge_chunks():
    """Get all text chunks and vector embedding previews from ChromaDB."""
    try:
        init_chroma()
        if collection is None:
            return []
        data = collection.get(include=["documents", "metadatas", "embeddings"])
        ids = data.get("ids") or []
        documents = data.get("documents") or []
        metadatas = data.get("metadatas") or []
        raw_embeddings = data.get("embeddings")

        results = []
        for idx, chunk_id in enumerate(ids):
            text = documents[idx] if idx < len(documents) else ""
            meta = metadatas[idx] if idx < len(metadatas) else {}
            emb = raw_embeddings[idx] if raw_embeddings is not None and idx < len(raw_embeddings) else []
            emb_list = list(emb) if hasattr(emb, "__iter__") else []
            
            results.append({
                "id": chunk_id,
                "doc_id": meta.get("doc_id", "unknown"),
                "filename": meta.get("filename", meta.get("type", "knowledge_item")),
                "text": text,
                "embedding_dim": len(emb_list),
                "embedding_preview": [round(float(x), 4) for x in emb_list[:8]],
            })
        return results
    except Exception as e:
        logger.error(f"Failed to fetch knowledge chunks: {e}")
        return []

@router.post("/knowledge/search")
def search_knowledge_chunks(req: SearchKBRequest):
    """Semantic vector search against ChromaDB."""
    if not req.query.strip():
        return []
    try:
        init_chroma()
        if collection is None or embeddings is None:
            return []
        query_emb = embeddings.embed_query(req.query)
        res = collection.query(
            query_embeddings=[query_emb],
            n_results=req.limit or 5,
            include=["documents", "metadatas", "distances"]
        )
        ids = res.get("ids", [[]])[0]
        docs = res.get("documents", [[]])[0]
        metas = res.get("metadatas", [[]])[0]
        dists = res.get("distances", [[]])[0]

        items = []
        for i in range(len(ids)):
            dist = dists[i] if i < len(dists) else 0.0
            similarity = max(0.0, round((1.0 - float(dist)) * 100, 1))
            items.append({
                "id": ids[i],
                "doc_id": metas[i].get("doc_id", "unknown") if i < len(metas) else "",
                "filename": metas[i].get("filename", metas[i].get("type", "chunk")) if i < len(metas) else "chunk",
                "text": docs[i] if i < len(docs) else "",
                "similarity": similarity,
                "distance": round(float(dist), 4),
            })
        return items
    except Exception as e:
        logger.error(f"Vector search failed: {e}")
        return []

@router.get("/knowledge/graph")
def get_knowledge_graph():
    """Extract entity-relationship graph (Graph RAG) from KB documents and experiences."""
    try:
        init_chroma()
    except Exception as e:
        logger.warning(f"init_chroma deferred in get_knowledge_graph: {e}")

    nodes = []
    links = []
    node_set = set()

    def clean_text(t: str, max_len: int = 14) -> str:
        if not t:
            return ""
        s = t.replace("#", "").replace("*", "").replace("\n", " ").strip()
        return s[:max_len] + "..." if len(s) > max_len else s

    def add_node(node_id: str, label: str, category: str, val: int = 10):
        if node_id not in node_set:
            node_set.add(node_id)
            nodes.append({
                "id": node_id,
                "name": clean_text(label, 16),
                "category": category,
                "symbolSize": min(42, max(18, val * 4)),
                "value": val
            })

    def add_link(source: str, target: str, relation: str):
        if source in node_set and target in node_set:
            links.append({
                "source": source,
                "target": target,
                "relation": relation,
                "label": {"show": True, "formatter": relation, "fontSize": 10}
            })

    # Add core Root Node
    add_node("kb_root", "工业知识拓扑 (Graph RAG)", "System", 10)

    # 1. Fetch DB Documents (top 8)
    with get_connection("config.db") as conn:
        docs = conn.execute("SELECT doc_id, filename, chunk_count FROM kb_documents WHERE status = 'completed' ORDER BY created_at DESC LIMIT 8").fetchall()
        for d in docs:
            doc_node_id = f"doc_{d['doc_id']}"
            add_node(doc_node_id, d['filename'], "Document", d['chunk_count'] or 3)
            add_link("kb_root", doc_node_id, "包含文档")

    # 2. Fetch Experience Rules (top 12)
    with get_connection("config.db") as conn:
        exps = conn.execute("SELECT id, content, extracted_rule, status FROM kb_experience_queue WHERE status IN ('approved', 'auto_approved') ORDER BY created_at DESC LIMIT 12").fetchall()
        for exp in exps:
            exp_id = f"exp_{exp['id']}"
            rule_text = exp['extracted_rule'] or ""
            add_node(exp_id, f"经验: {clean_text(rule_text, 12)}", "Experience", 4)
            add_link("kb_root", exp_id, "沉淀经验")

            # Extract basic entities (Device, Fault, Solution)
            txt = rule_text
            if "AMR" in txt or "AGV" in txt:
                add_node("ent_amr", "AMR 调度卡口", "Device", 6)
                add_link(exp_id, "ent_amr", "关联设备")
            if "通讯" in txt or "超时" in txt or "E04" in txt:
                add_node("ent_e04", "E04 通讯异常", "Fault", 6)
                add_link(exp_id, "ent_e04", "故障现象")
                add_node("ent_sol_wifi", "重置 5G AP 节点", "Solution", 6)
                add_link("ent_e04", "ent_sol_wifi", "解决方案")
            if "晶圆" in txt or "FOUP" in txt:
                add_node("ent_wafer", "FOUP 晶圆搬运规范", "Concept", 5)
                add_link(exp_id, "ent_wafer", "业务规则")

    # 3. Add default domain nodes if sparse
    if len(nodes) <= 1:
        add_node("ent_amr", "AMR 物料搬运机器人", "Device", 8)
        add_node("ent_wafer", "半导体晶圆洁净车间规范", "Concept", 8)
        add_node("ent_plc", "PLC 梯形图故障诊断协议", "Protocol", 7)
        add_link("kb_root", "ent_amr", "设备知识")
        add_link("kb_root", "ent_wafer", "场景规范")
        add_link("kb_root", "ent_plc", "工控协议")

    categories = [
        {"name": "System"},
        {"name": "Document"},
        {"name": "Experience"},
        {"name": "Device"},
        {"name": "Fault"},
        {"name": "Solution"},
        {"name": "Concept"},
        {"name": "Protocol"}
    ]

    return {
        "nodes": nodes,
        "links": links,
        "categories": categories
    }

