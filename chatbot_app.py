import os
import streamlit as st
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain.vectorstores import FAISS
from langchain.chains import ConversationalRetrievalChain

# Load environment variables
load_dotenv()

# Path to FAISS index
FAISS_INDEX_PATH = "faiss_index"

# Global Model Configuration (Ensuring correct model name formats)
GEMINI_EMBEDDING_MODEL = "models/text-embedding-004" 
GEMINI_LLM_MODEL = "gemini-2.5-flash"

def load_vectorstore():
    """Load the FAISS index."""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not set.")
        
    if not os.path.exists(FAISS_INDEX_PATH) or not os.path.exists(os.path.join(FAISS_INDEX_PATH, "index.faiss")):
        raise FileNotFoundError("FAISS index not found. Please run 'file_processor.py' and save embeddings first.")
    
    # Initialize Gemini Embeddings (must match the model used for creation)
    embeddings = GoogleGenerativeAIEmbeddings(model=GEMINI_EMBEDDING_MODEL, google_api_key=api_key)
    
    # allow_dangerous_deserialization=True is required for loading FAISS files created with LangChain
    return FAISS.load_local(FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True)

# Initialize Streamlit App
st.set_page_config(page_title="Krish technolabs HR Knowledgebase", page_icon="💬")
st.title("Krish technolabs HR Chatbot")
st.markdown("""
Welcome to the **Krish technolabs HR Chatbot**, your **HR Assistant**! 💬  

I can assist with questions about company policies, training materials, rate cards, and more.
""")

# User console should not expose API key configuration
if not os.getenv("GOOGLE_API_KEY"):
    st.warning(
        "The chatbot is not connected to the HR knowledgebase yet. "
        "Please contact an administrator to configure the Gemini API key."
    )

# Initialize session state for chat history
if "messages" not in st.session_state:
    st.session_state.messages = []

# Display previous messages
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Initialization block
try:
    if "vectorstore" not in st.session_state and os.getenv("GOOGLE_API_KEY"):
        st.session_state.vectorstore = load_vectorstore()

    if "vectorstore" in st.session_state and "rag_chain" not in st.session_state:
        # Initialize Gemini LLM for the chat chain
        llm = ChatGoogleGenerativeAI(temperature=0.0, model=GEMINI_LLM_MODEL, google_api_key=os.getenv("GOOGLE_API_KEY"))
        
        st.session_state.rag_chain = ConversationalRetrievalChain.from_llm(
            llm=llm,
            retriever=st.session_state.vectorstore.as_retriever(),
            return_source_documents=True,
        )
        st.success("Chatbot ready! Ask your HR questions.")

except Exception as e:
    # Improved error handling for common issues
    if "GOOGLE_API_KEY" in str(e) or "index.faiss" in str(e):
        st.error(f"Error initializing chatbot: {e}. Please ensure your Gemini API Key is set and the FAISS index is created.")
    else:
        st.error(f"Error initializing chatbot: {e}")


# --- CORRECTED USER INPUT AND CHAT LOGIC BLOCK ---
if prompt := st.chat_input("Type your message here..."):
    # Check necessary conditions now that we have a valid prompt string
    if os.getenv("GOOGLE_API_KEY") and "rag_chain" in st.session_state:

        # Add user message to session state
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)

        # Generate assistant's response
        try:
            with st.chat_message("assistant"):
                with st.spinner("Thinking..."):
                    # Convert chat history to expected format (list of tuples)
                    chat_history = [
                        (st.session_state.messages[idx]["content"], st.session_state.messages[idx + 1]["content"])
                        for idx, m in enumerate(st.session_state.messages[:-1])
                        if st.session_state.messages[idx]["role"] == "user" and idx + 1 < len(st.session_state.messages)
                    ]

                    # Note: prompt is now guaranteed to be the input string
                    result = st.session_state.rag_chain.invoke({
                        "question": prompt,
                        "chat_history": chat_history,
                    })

                    response = result["answer"]
                    st.markdown(f"**Krish technolabs Assistant:** {response}")
                    
                    # Optionally display sources
                    source_docs = result.get("source_documents", [])
                    if source_docs:
                        sources = ", ".join(set(d.metadata.get("source", "Unknown Document") for d in source_docs))
                        st.info(f"Sources: {sources}")


            # Add assistant's response to session state
            st.session_state.messages.append({"role": "assistant", "content": response})
        except Exception as e:
            # Catch API or execution errors
            st.error(f"Error generating answer: {e}")
            # Remove the last user message from history if the chat failed
            st.session_state.messages.pop() 
            
    elif not os.getenv("GOOGLE_API_KEY"):
        st.info("The chatbot is waiting for the admin to configure the Gemini API key.")
    elif "rag_chain" not in st.session_state:
        st.info("Waiting for initialization. Ensure 'file_processor.py' has been run to create the FAISS index.")
# --- END CORRECTED USER INPUT AND CHAT LOGIC BLOCK ---