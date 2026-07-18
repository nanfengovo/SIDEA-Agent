import os
import uuid
import json
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional

from infra.logging.structured_logger import get_structured_logger
from infra.database import get_connection

# ChromaDB & Langchain
import chromadb
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = get_structured_logger("api.routes.knowledge")
router = APIRouter()

# Global ChromaDB client & collection
chroma_client = None
collection = None
embeddings = None

def init_chroma():
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
            rule = res.content
            
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
