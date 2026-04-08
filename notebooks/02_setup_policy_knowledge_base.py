# Databricks notebook source
# MAGIC %md
# MAGIC # 02 - Setup Policy Knowledge Base
# MAGIC
# MAGIC This notebook creates the knowledge base for the AI Governance Policy Assistant.
# MAGIC It stores policy document chunks in a Delta table with change data feed enabled,
# MAGIC creates a Vector Search index for semantic retrieval, and enables RAG-based Q&A.
# MAGIC
# MAGIC **Components:**
# MAGIC - Policy documents (PDFs) stored in UC Volume
# MAGIC - Chunked text stored in Delta table
# MAGIC - Vector Search index with auto-sync embeddings
# MAGIC - RAG endpoint using foundation model + vector search

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Volume for Policy PDFs

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE VOLUME IF NOT EXISTS cmegdemos_catalog.ai_governance.policy_documents
# MAGIC COMMENT 'AI Governance Policy Documents for Knowledge Assistant';

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Policy Chunks Table

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE TABLE IF NOT EXISTS cmegdemos_catalog.ai_governance.policy_chunks (
# MAGIC   chunk_id BIGINT GENERATED ALWAYS AS IDENTITY,
# MAGIC   policy_name STRING NOT NULL,
# MAGIC   chunk_text STRING NOT NULL,
# MAGIC   source_file STRING
# MAGIC )
# MAGIC TBLPROPERTIES (delta.enableChangeDataFeed = true)
# MAGIC COMMENT 'Chunked text from AI governance policy documents for vector search';

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Policy Content
# MAGIC Insert policy text chunks. In production, these would be parsed from PDF files
# MAGIC stored in the volume. Here we insert the pre-chunked content directly.

# COMMAND ----------

# Policy documents content
policies = {
    "AI Data Access Regulation Policy": [
        "This policy establishes the framework for regulating access to data used by artificial intelligence systems within MT&T Corporation. It applies to all employees, contractors, partners, and automated systems that access, process, or generate data through AI/ML platforms deployed on the Databricks Lakehouse Platform. The policy covers all workspaces, model serving endpoints, AI Gateway configurations, foundation model APIs, vector search indexes, and Genie rooms.",
        "All data accessed by AI systems must be classified into four tiers: Public (freely used for AI training and inference), Internal (restricted to internal AI applications with standard access controls), Confidential (requiring enhanced controls including audit logging, encryption, and role-based access), and Restricted (requiring explicit Data Governance Council approval before AI processing, including PII, PHI, financial records, and customer communications).",
        "AI models trained on Confidential or Restricted data must be tagged in Unity Catalog with sensitivity labels. Model serving endpoints exposing such models must implement AI Gateway guardrails to prevent data leakage in responses.",
        "All AI platform access must use Unity Catalog-managed identities. Service principals must be used for automated workflows and model serving endpoints. Personal access tokens are prohibited for production AI workloads. Access to model serving endpoints must follow the principle of least privilege with explicit access control lists.",
        "Cross-workspace access to AI resources requires approval from both source and destination workspace administrators. All cross-workspace AI data flows must be documented in the AI Data Flow Registry.",
        "All AI data access events must be captured in the system.access.audit table. The AI Governance team must review audit logs weekly for anomalous access patterns. Model serving endpoint usage must be monitored via system.serving.endpoint_usage with alerts for failed requests exceeding 100/hour, unrecognized IPs, token consumption spikes, and maintenance window access.",
        "AI inference logs containing input/output data must be retained for 90 days for audit purposes then purged. When a model serving endpoint is decommissioned, all associated inference tables, vector search indexes, and cached embeddings must be deleted within 30 days.",
        "Violations of the AI Data Access Regulation Policy will be reported to the Chief Data Officer and may result in immediate revocation of AI platform access. Annual compliance audits will be conducted using the AI Access Audit view to verify adherence."
    ],
    "AI Model Governance and Lifecycle Policy": [
        "This policy defines the governance framework for the complete lifecycle of AI models within MT&T Corporation, from development through deployment, monitoring, and retirement.",
        "All AI models must be developed using MT&T-approved frameworks and registered in Unity Catalog Model Registry. Each model must have a Model Card documenting purpose, training data sources and lineage, performance metrics, known limitations and biases, and responsible AI assessment results.",
        "Currently approved foundation models include Meta Llama 3.3 70B, Anthropic Claude family, OpenAI GPT-4 family, Google Gemini family, and DBRX. Provisioned throughput endpoints must be justified with cost-benefit analysis showing expected usage above 60% utilization.",
        "Model deployment requires a three-stage approval: Stage 1 Technical Review (MLOps validates performance and serving config), Stage 2 Security Review (access controls, data classification, AI Gateway guardrails), Stage 3 Business Review (approved use case and budget). Emergency deployments may bypass Stage 3 with two VP sponsors but must complete review within 5 business days.",
        "Production monitoring requirements include tracking request volume, token consumption, error rates, and latency through the AI Governance Dashboard. Alerts must be configured for error rates exceeding 5%, latency exceeding SLA thresholds, cost exceeding 120% of budget, and input distribution drift.",
        "Endpoints classified as Idle (zero requests in 30 days) must be decommissioned within 14 days unless business justification is provided. Endpoints classified as Very Low (fewer than 100 requests) must provide a utilization improvement plan within 30 days.",
        "Model retirement process includes 30-day deprecation notice, traffic migration, artifact archival, endpoint deletion, and confirmation via the AI Governance Dashboard.",
        "All customer-facing AI models must undergo bias testing before deployment. Models used for decisions affecting customers must provide explainability features. AI Gateway guardrails must block harmful content, PII leakage, and off-topic responses."
    ],
    "AI Cost Management and FinOps Policy": [
        "This policy establishes the financial governance framework for AI/ML workloads within MT&T. It ensures cost transparency, accountability, and optimization across model serving, foundation model APIs, model training, and AI-powered analytics.",
        "AI costs are categorized into five pillars: Foundation Model Serving (Anthropic, OpenAI, Gemini - owned by AI Platform team), Custom Model Inference (real-time inference endpoints - owned by business unit ML teams), Model Training (GPU compute for fine-tuning - owned by Data Science CoE), AI-Powered Analytics (Genie rooms, AI/BI dashboards - owned by Analytics team), and AI Infrastructure (vector search, feature serving - owned by MLOps team).",
        "Cost categories are tracked via v_ai_cost_daily using billing SKUs: ENTERPRISE_ANTHROPIC_MODEL_SERVING, ENTERPRISE_OPENAI_MODEL_SERVING, ENTERPRISE_GEMINI_MODEL_SERVING, ENTERPRISE_MODEL_TRAINING, and ENTERPRISE_SERVERLESS_REAL_TIME_INFERENCE.",
        "Budget approval thresholds: Under $5K/month requires team lead approval, $5K-$25K requires Director approval with cost justification, $25K-$100K requires VP approval with ROI analysis, over $100K requires C-suite approval with strategic business case.",
        "Cost monitoring alerts must be configured for daily cost exceeding 150% of 30-day rolling average, monthly cost on track to exceed 110% of budget, any single endpoint consuming more than 25% of BU AI budget, and new AI SKUs appearing without budget approval.",
        "Quarterly cost optimization must include consolidating underutilized endpoints, right-sizing provisioned throughput, implementing request caching, using smaller models where possible, and batching inference for non-real-time workloads. Target: 15% year-over-year cost efficiency improvement.",
        "All AI costs must be attributed to business units using Unity Catalog tags and usage_context fields. Monthly chargeback reports are generated from v_ai_cost_daily and v_serving_endpoint_daily views."
    ],
    "AI Security and Access Control Policy": [
        "This policy defines security controls and access management for AI systems within MT&T. It addresses authentication, authorization, network security, data protection, and incident response specific to AI/ML workloads.",
        "Authentication requirements: federated authentication through enterprise IdP (Azure AD/Okta), MFA required for all human users, service principals must use OAuth M2M tokens with 90-day rotation. Personal access tokens prohibited for production workloads.",
        "Authorization follows RBAC with roles: AI Platform Admin (full access), Model Owner (manage specific endpoints and metrics), Model Consumer (invoke endpoints and Genie rooms), AI Auditor (read-only governance views), Data Scientist (training resources and development endpoints).",
        "Unauthorized access detection via v_ai_access_audit monitors: HTTP 401/403 responses, more than 5 denied attempts per user per hour, access to decommissioned endpoints, access from unapproved IP ranges, and unexpected service principal access. SOC must investigate high-severity alerts within 4 hours.",
        "AI Gateway security requirements: rate limiting (100 req/min/user for chat), content filtering (block PII, hate speech, harmful content), token limits (4096 input, 2048 output for standard users), and fallback routing with automatic failover.",
        "Model serving endpoints for Confidential/Restricted data must use private endpoints (AWS PrivateLink). Public endpoints require IP allowlisting.",
        "AI security incidents include data exfiltration through responses, prompt injection attacks, unauthorized model deployment, AI Gateway bypass attempts, and anomalous token consumption."
    ],
    "Genie Room and AI Assistant Governance Policy": [
        "This policy establishes governance for Databricks Genie rooms and AI-powered assistants at MT&T. It ensures natural language analytics tools are deployed responsibly with appropriate access controls, usage monitoring, and quality assurance.",
        "New Genie rooms require approval from data owner(s), workspace administrator, and AI Governance team (for system tables or cross-functional data). Each room must have a designated owner.",
        "Genie rooms inherit Unity Catalog permissions - users can only query data they have SELECT access to. Rooms must NOT contain raw PII, unmasked financial data, or employee HR records unless dynamic data masking is applied.",
        "Usage monitoring through v_assistant_genie_usage tracks daily event counts per user, peak usage hours, active vs inactive rooms, and adoption metrics. Usage limits: 500 queries/user/day, 50 concurrent users per room, 5-minute query timeout.",
        "Genie room responses are non-deterministic and must be treated as analytical suggestions. Critical business decisions must not be based solely on Genie output without human verification.",
        "Genie room conversations are logged and retained for 90 days. Rooms for regulatory reporting must be validated by Compliance before deployment."
    ],
    "AI Platform Acceptable Use Policy": [
        "This policy defines acceptable and prohibited uses of MT&T AI platform resources including model serving endpoints, foundation model APIs, AI Gateway, Genie rooms, and associated tools.",
        "Approved use cases include: customer experience improvement (chatbots, virtual assistants), network optimization and predictive maintenance, fraud detection and security analytics, revenue analytics and churn prediction, internal knowledge management, data quality monitoring, and self-service analytics through Genie rooms.",
        "Prohibited uses: generating illegal content, AI for employment decisions without HR/Legal approval, unauthorized competitive intelligence, training on customer data without consent, generating code for unauthorized systems, sharing endpoint credentials externally, bypassing AI Gateway guardrails, and using production resources for personal projects.",
        "User responsibilities: complete annual AI Ethics and Governance training, report violations within 24 hours, populate usage_context fields in serving requests, review and acknowledge this policy annually.",
        "Model serving endpoint owners must: monitor through AI Governance Dashboard, respond to utilization alerts within 2 business days, participate in quarterly cost optimization, and maintain Model Cards.",
        "Violation classification: Minor (verbal warning), Moderate (written warning, retraining), Severe (access revocation, disciplinary action), Critical (termination, legal action)."
    ]
}

# Insert chunks
from pyspark.sql import Row
rows = []
for policy_name, chunks in policies.items():
    source_file = policy_name.replace(" ", "_") + ".pdf"
    for chunk_text in chunks:
        rows.append(Row(policy_name=policy_name, chunk_text=chunk_text, source_file=source_file))

df = spark.createDataFrame(rows)
df.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable("cmegdemos_catalog.ai_governance.policy_chunks")

print(f"Inserted {len(rows)} chunks across {len(policies)} policies")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Vector Search Index
# MAGIC Creates a Delta Sync vector search index with automatic embedding generation.

# COMMAND ----------

from databricks.vector_search.client import VectorSearchClient

vsc = VectorSearchClient()

# Use an existing VS endpoint or create one
VS_ENDPOINT = "mas-b3feefeb-endpoint"
INDEX_NAME = "cmegdemos_catalog.ai_governance.policy_chunks_vs_index"

try:
    vsc.create_delta_sync_index(
        endpoint_name=VS_ENDPOINT,
        source_table_name="cmegdemos_catalog.ai_governance.policy_chunks",
        index_name=INDEX_NAME,
        pipeline_type="TRIGGERED",
        primary_key="chunk_id",
        embedding_source_column="chunk_text",
        embedding_model_endpoint_name="databricks-gte-large-en"
    )
    print(f"Created vector search index: {INDEX_NAME}")
except Exception as e:
    if "already exists" in str(e).lower():
        print(f"Index {INDEX_NAME} already exists")
    else:
        raise e

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verify Index
# MAGIC Test that the vector search index returns relevant results.

# COMMAND ----------

import time

# Wait for index to be ready
index = vsc.get_index(VS_ENDPOINT, INDEX_NAME)
while not index.describe().get("status", {}).get("ready"):
    print("Waiting for index to be ready...")
    time.sleep(10)
    index = vsc.get_index(VS_ENDPOINT, INDEX_NAME)

# Test search
results = index.similarity_search(
    columns=["chunk_id", "policy_name", "chunk_text"],
    query_text="What are the data classification tiers?",
    num_results=3
)

for row in results.get("result", {}).get("data_array", []):
    print(f"Policy: {row[1]}")
    print(f"Text: {row[2][:100]}...")
    print("---")
