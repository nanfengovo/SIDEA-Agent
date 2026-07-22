import asyncio
import json
from datetime import datetime
from infra.database import get_connection
from infra.logging.structured_logger import get_structured_logger
from langchain_core.messages import SystemMessage, HumanMessage
from core.audit_logger import log_auto_task

logger = get_structured_logger("core.kb_auto_review")

DB_PATH = "config.db"

async def auto_review_loop(interval_seconds: int = 300):
    """
    Background loop that periodically checks for pending experience rules,
    applies active AI review rules, and automatically approves or rejects them.
    """
    logger.info(f"Starting KB Auto-Review Loop (interval: {interval_seconds}s)")
    while True:
        try:
            await perform_auto_review()
        except Exception as e:
            logger.error(f"Error in auto_review_loop: {e}", exc_info=True)
        
        await asyncio.sleep(interval_seconds)

async def perform_auto_review():
    """Execute one cycle of the auto-review process."""
    
    # 1. Fetch pending items
    with get_connection(DB_PATH) as conn:
        pending_items = conn.execute(
            "SELECT * FROM kb_experience_queue WHERE status = 'pending'"
        ).fetchall()
        
    if not pending_items:
        return

    # 2. Fetch active rules
    with get_connection(DB_PATH) as conn:
        active_rules = conn.execute(
            "SELECT * FROM kb_review_rules WHERE is_active = 1"
        ).fetchall()
        
    if not active_rules:
        logger.info("No active review rules found. Skipping auto-review.")
        return
        
    # Format rules for the prompt
    rules_text = "\n".join([f"- {r['rule_name']}: {r['prompt']}" for r in active_rules])
    
    # Update last_executed_at for active rules
    try:
        with get_connection(DB_PATH) as conn:
            conn.execute(
                "UPDATE kb_review_rules SET last_executed_at = datetime('now','localtime') WHERE is_active = 1"
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to update last_executed_at: {e}")

    logger.info(f"Auto-reviewing {len(pending_items)} pending items against {len(active_rules)} rules.")
    log_auto_task(
        action="kb_auto_review",
        description=f"Starting auto-review for {len(pending_items)} pending items against {len(active_rules)} rules.",
        status="success",
        raw_data={"pending_count": len(pending_items), "active_rules_count": len(active_rules), "rule_ids": [r['id'] for r in active_rules]}
    )
    
    # 3. Import LLM tools
    try:
        from agent.graph import _get_llm
        from infra.config_store import ConfigStore
        config_store = ConfigStore(DB_PATH)
        llm = _get_llm(config_store)
        # Use structured output for reliable parsing
        llm_with_structured_output = llm.with_structured_output(
            schema={
                "title": "ReviewResult",
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["approve", "reject"],
                        "description": "Whether to approve or reject the experience."
                    },
                    "reason": {
                        "type": "string",
                        "description": "Explanation for the decision based on the rules."
                    },
                    "edited_rule": {
                        "type": "string",
                        "description": "If approved, provide the final, polished, high-value experience rule. If rejected, leave empty."
                    }
                },
                "required": ["action", "reason"]
            }
        )
    except Exception as e:
        logger.error(f"Failed to initialize LLM for auto-review: {e}")
        return

    system_prompt = f"""
You are an expert AI Knowledge Base Reviewer for an industrial/semiconductor domain.
Your task is to evaluate pending 'experience rules' extracted from chat logs against the following strict rules defined by the administrators:

ADMIN REVIEW RULES:
{rules_text}

If the experience violates ANY of these rules, or is simply noisy/useless, you must REJECT it.
If the experience satisfies ALL rules and is valuable, you must APPROVE it.
When approving, you may refine and polish the `edited_rule` to make it more professional, concise, and structured.
"""
    
    for item in pending_items:
        exp_id = item["id"]
        content = item["content"]
        extracted_rule = item["extracted_rule"]
        
        user_prompt = f"""
Please evaluate the following extracted experience:

ORIGINAL CHAT CONTEXT:
{content}

CURRENT EXTRACTED RULE:
{extracted_rule}
"""
        try:
            res = await llm_with_structured_output.ainvoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ])
            
            action = res.get("action", "reject")
            reason = res.get("reason", "")
            edited_rule = res.get("edited_rule", extracted_rule)
            
            if action == "approve":
                final_rule = edited_rule if edited_rule else extracted_rule
                _approve_and_ingest(exp_id, final_rule, reason)
            else:
                _reject_item(exp_id, reason)
                
        except Exception as e:
            logger.error(f"Failed to auto-review item {exp_id}: {e}")
            log_auto_task(
                action="kb_auto_review_item",
                description=f"Error evaluating item {exp_id}",
                status="failed",
                raw_data={"exp_id": exp_id, "error": str(e)}
            )

    log_auto_task(
        action="kb_auto_review_done",
        description=f"Completed auto-review cycle.",
        status="success"
    )

def _approve_and_ingest(exp_id: str, final_rule: str, reason: str):
    """Approve the item, ingest into ChromaDB, and update DB status."""
    try:
        from api.routes.knowledge import init_chroma, embeddings, collection
        
        # 1. Update DB
        with get_connection(DB_PATH) as conn:
            conn.execute(
                """
                UPDATE kb_experience_queue 
                SET status = 'auto_approved', extracted_rule = ?
                WHERE id = ?
                """,
                (final_rule, exp_id)
            )
            conn.commit()
            
        # 2. Ingest to ChromaDB
        init_chroma()
        doc_id = f"exp_{exp_id}"
        chunk_embedding = embeddings.embed_documents([final_rule])
        collection.add(
            documents=[final_rule],
            embeddings=chunk_embedding,
            metadatas=[{"doc_id": doc_id, "type": "experience", "auto_approved": True, "reason": reason}],
            ids=[doc_id]
        )
        logger.info(f"Auto-approved experience {exp_id}")
    except Exception as e:
        logger.error(f"Failed to ingest auto-approved item {exp_id}: {e}")

def _reject_item(exp_id: str, reason: str):
    """Mark the item as auto_rejected."""
    try:
        with get_connection(DB_PATH) as conn:
            conn.execute(
                """
                UPDATE kb_experience_queue 
                SET status = 'auto_rejected'
                WHERE id = ?
                """,
                (exp_id,)
            )
            conn.commit()
        logger.info(f"Auto-rejected experience {exp_id} due to: {reason}")
    except Exception as e:
        logger.error(f"Failed to reject item {exp_id}: {e}")
