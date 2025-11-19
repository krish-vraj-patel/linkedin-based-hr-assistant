import os
from dotenv import load_dotenv
from langchain.prompts import PromptTemplate
from langchain_community.vectorstores import FAISS
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

# Load the API key from env variables
load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")

# Global Model Configuration
GEMINI_EMBEDDING_MODEL = "models/text-embedding-004"
GEMINI_LLM_MODEL = "gemini-2.5-flash"

# Updated RAG Prompt for HR Chatbot
RAG_PROMPT_TEMPLATE = """
You are a helpful and professional **HR Chatbot Assistant** for TekRevol. 
Your goal is to answer questions strictly based on the provided HR policy documents. 
Cite the source of the policy or document whenever possible.

If you don't know the answer based on the context, state clearly that you do not have that information in the current documents.

Context: {context}
Question: {question}
"""

PROMPT = PromptTemplate.from_template(RAG_PROMPT_TEMPLATE)


def format_docs(docs):
    """Formats the retrieved documents into a single string."""
    return "\n\n".join(doc.page_content for doc in docs)


def create_rag_chain(chunks):
    """
    Creates a simple RAG chain using the provided document chunks, 
    Gemini embeddings, and Gemini LLM.
    """
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not set.")

    # Initialize Gemini Embeddings
    embeddings = GoogleGenerativeAIEmbeddings(model=GEMINI_EMBEDDING_MODEL, google_api_key=api_key)
    
    # Create the vector store from the chunks
    doc_search = FAISS.from_documents(chunks, embeddings)
    retriever = doc_search.as_retriever(
        search_type="similarity", search_kwargs={"k": 5}
    )
    
    # Initialize Gemini LLM
    llm = ChatGoogleGenerativeAI(model=GEMINI_LLM_MODEL, temperature=0, google_api_key=api_key)

    # Construct the RAG chain
    rag_chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | PROMPT
        | llm
        | StrOutputParser()
    )
    return rag_chain