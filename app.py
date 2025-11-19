import streamlit as st
import os
from dotenv import load_dotenv
from src.document_processor import process_document
from src.rag_chain import create_rag_chain

# Load environment variables
load_dotenv()

st.set_page_config(page_title="TekRevol Simple RAG", page_icon="📄")
st.title("TekRevol Simple Document RAG")
st.markdown("Upload a document, process it, and ask questions.")

# Initialize session state
if "rag_chain" not in st.session_state:
    st.session_state.rag_chain = None

# Sidebar for API key input
with st.sidebar:
    api_key = st.text_input("Enter your Gemini API Key", type="password")
    if api_key:
        os.environ["GOOGLE_API_KEY"] = api_key

# File uploader
uploaded_file = st.file_uploader("Choose a file", type=["pdf"])
if uploaded_file is not None:
    if st.button("Process File"):
        if api_key:
            with st.spinner("Processing file..."):
                # Save the uploaded file temporarily
                temp_file_path = os.path.join("uploaded_files", uploaded_file.name)
                os.makedirs("uploaded_files", exist_ok=True)
                with open(temp_file_path, "wb") as f:
                    f.write(uploaded_file.getbuffer())
                
                try:
                    # Process the document
                    chunks = process_document(temp_file_path)
                    # Create RAG chain (using Gemini LLM/Embeddings from rag_chain.py)
                    st.session_state.rag_chain = create_rag_chain(chunks)
                    st.success("File processed successfully! You can now ask questions.")
                except ValueError as e:
                    st.error(str(e))
                except Exception as e:
                    st.error(f"An unexpected error occurred during processing: {e}")
                finally:
                    # Remove the temporary file
                    if os.path.exists(temp_file_path):
                        os.remove(temp_file_path)
        else:
            st.error("Please provide your Gemini API key.")
# Query input
query = st.text_input("Ask a question about the uploaded document")
if st.button("Ask"):
    if st.session_state.rag_chain and query:
        with st.spinner("Generating answer..."):
            try:
                result = st.session_state.rag_chain.invoke(query)
                st.subheader("Answer:")
                st.write(result)
            except Exception as e:
                st.error(f"Error generating answer: {e}")

    elif not st.session_state.rag_chain:
        st.error("Please upload and process a file first.")
    else:
        st.error("Please enter a question.")