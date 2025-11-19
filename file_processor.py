import os
import shutil
import logging
import streamlit as st
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain.vectorstores import FAISS
from src.document_processor import process_document, extract_text_from_webpage, split_documents
from langchain.chains.summarize import load_summarize_chain
from langchain.schema import Document

# Load environment variables
load_dotenv()

# Paths
UPLOAD_DIR = "uploaded_files"
FAISS_INDEX_PATH = "faiss_index"

# Global Model Configuration
GEMINI_EMBEDDING_MODEL = "models/text-embedding-004"
GEMINI_LLM_MODEL = "gemini-2.5-flash"
# Initialize logging
logging.basicConfig(level=logging.INFO)

# Ensure the upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

def clear_embeddings():
    """Clear all existing embeddings."""
    if os.path.exists(FAISS_INDEX_PATH):
        shutil.rmtree(FAISS_INDEX_PATH)
        os.makedirs(FAISS_INDEX_PATH, exist_ok=True)
    logging.info("FAISS index cleared.")

def process_and_store_embeddings(documents):
    """Process the input documents and store embeddings."""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not set. Please set it before running this process.")

    # Initialize Gemini Embeddings
    embeddings = GoogleGenerativeAIEmbeddings(model=GEMINI_EMBEDDING_MODEL, google_api_key=api_key)

    # Split documents into chunks
    chunks = split_documents(documents)

    # Check if FAISS index already exists to update it
    if os.path.exists(FAISS_INDEX_PATH) and os.path.isdir(FAISS_INDEX_PATH) and os.listdir(FAISS_INDEX_PATH):
        logging.info("Existing index found. Appending new embeddings.")
        vectorstore = FAISS.load_local(FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True)
        vectorstore.add_documents(chunks)
    else:
        logging.info("No existing index found. Creating new FAISS index.")
        vectorstore = FAISS.from_documents(chunks, embeddings)

    vectorstore.save_local(FAISS_INDEX_PATH)
    logging.info(f"Embeddings created and saved to {FAISS_INDEX_PATH}.")
    return vectorstore


def summarize_documents(documents):
    """Summarize the provided documents."""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not set.")
        
    # Initialize Gemini LLM for summarization
    llm = ChatGoogleGenerativeAI(temperature=0, model=GEMINI_LLM_MODEL, google_api_key=api_key)
    
    chain = load_summarize_chain(llm, chain_type="stuff")
    return chain.run(documents)

# Initialize Streamlit App
st.set_page_config(page_title="Krish technolabs HR Processor", page_icon="📄")
st.title("Krish technolabs HR Knowledgebase Processor")
st.markdown("Use this tool to upload or provide links to your HR policy documents for processing.")

# Sidebar for API key input
with st.sidebar:
    api_key = st.text_input("Enter your Gemini API Key", type="password")
    if api_key:
        os.environ["GOOGLE_API_KEY"] = api_key

    st.markdown("---")
    task_option = st.radio(
        "Select Task:",
        ["Ask Questions (Creates/Updates Index)", "Summarize (Does NOT Create Index)"],
        index=0,
        help="The 'Ask Questions' task creates/updates the FAISS index for the chatbot. The 'Summarize' task provides a quick summary without affecting the index."
    )
    input_option = st.radio(
        "Select Input Type:",
        ["Upload Files", "Enter URLs"],
        index=0,
    )
    
# Main application logic
if input_option == "Upload Files":
    uploaded_files = st.file_uploader("Choose files (PDF, JPG, PNG, DOCX)", type=["pdf", "jpg", "jpeg", "png", "docx"], accept_multiple_files=True)
    if uploaded_files and st.button("Process Files"):
        if api_key:
            documents = []
            with st.spinner("Processing files..."):
                try:
                    for uploaded_file in uploaded_files:
                        file_path = os.path.join(UPLOAD_DIR, uploaded_file.name)
                        with open(file_path, "wb") as f:
                            f.write(uploaded_file.getbuffer())
                        
                        # Process the file and get documents
                        documents.extend(process_document(file_path))

                        # Clean up temporary file
                        os.remove(file_path)
                    
                    if not documents:
                        st.warning("No documents were processed.")
                    elif task_option.startswith("Summarize"):
                        summary = summarize_documents(documents)
                        st.subheader("Summary:")
                        st.write(summary)
                    else:
                        process_and_store_embeddings(documents)
                        st.success("Files processed and embeddings saved successfully!")
                except Exception as e:
                    st.error(str(e))
        else:
            st.error("Please provide your Gemini API key.")

elif input_option == "Enter URLs":
    urls = st.text_area("Enter URLs (one per line):")
    if urls.strip() and st.button("Process URLs"):
        if api_key:
            with st.spinner("Processing URLs..."):
                documents = []
                try:
                    for url in urls.strip().splitlines():
                        # Extract text from each URL and append chunks
                        documents.extend(extract_text_from_webpage(url))

                    if not documents:
                        st.warning("No documents were processed from the URLs.")
                    elif task_option.startswith("Summarize"):
                        summary = summarize_documents(documents)
                        st.subheader("Summary:")
                        st.write(summary)
                    else:
                        process_and_store_embeddings(documents)
                        st.success("URLs processed and embeddings saved successfully!")
                except Exception as e:
                    st.error(str(e))
        else:
            st.error("Please provide your Gemini API key.")

# Clear embeddings
if st.button("Clear Embeddings"):
    try:
        clear_embeddings()
        st.success("FAISS index cleared successfully!")
    except Exception as e:
        st.error(f"Error clearing embeddings: {e}")