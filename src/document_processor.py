import logging
from bs4 import BeautifulSoup
import requests
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.text_splitter import Language
from langchain_community.document_loaders import PyPDFLoader, UnstructuredImageLoader
from langchain_community.document_loaders.parsers.pdf import (
    extract_from_images_with_rapidocr,
)
from langchain.schema import Document

# Set up logging
logging.basicConfig(level=logging.INFO)

def process_pdf(source):
    """Process a PDF file and split it into chunks."""
    logging.info(f"Processing PDF: {source}")
    loader = PyPDFLoader(source)
    documents = loader.load()

    # Filter out scanned pages
    unscanned_documents = [doc for doc in documents if doc.page_content.strip() != ""]
    scanned_pages = len(documents) - len(unscanned_documents)

    if scanned_pages > 0:
        logging.info(f"Omitted {scanned_pages} scanned page(s) from the PDF.")

    if not unscanned_documents:
        raise ValueError(
            "All pages in the PDF appear to be scanned or empty. Please use a PDF with readable text content."
        )

    return split_documents(unscanned_documents)


def process_image(source):
    """Process an image file and split it into chunks using OCR."""
    logging.info(f"Processing image: {source}")
    try:
        loader = UnstructuredImageLoader(source)
        documents = loader.load()
        if not documents or not documents[0].page_content.strip():
             raise ValueError("Could not extract text from the image using OCR.")
        return split_documents(documents)
    except Exception as e:
        logging.error(f"Failed to process image: {source}, Error: {e}")
        raise ValueError(f"Failed to process image: {e}")


def extract_text_from_webpage(url):
    """Extract text from a webpage."""
    logging.info(f"Extracting text from URL: {url}")
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Remove script, style, and navigation elements
        for script_or_style in soup(["script", "style", "nav", "header", "footer"]):
            script_or_style.decompose()

        text_content = soup.get_text(separator="\n").strip()
        if not text_content:
            raise ValueError("No visible text found on the webpage.")
            
        return [Document(page_content=text_content, metadata={"source": url})]
    except requests.exceptions.HTTPError as e:
        raise ValueError(f"URL error ({e.response.status_code}): {url}")
    except requests.exceptions.RequestException as e:
        raise ValueError(f"Failed to connect to URL: {url}, Error: {e}")
    except Exception as e:
        logging.error(f"Failed to extract text from URL: {url}, Error: {e}")
        raise ValueError(f"Failed to extract text from URL: {e}")


def split_documents(documents, chunk_size=1000, chunk_overlap=200):
    """Split documents into smaller chunks."""
    logging.info(f"Splitting documents into chunks (chunk_size={chunk_size}, overlap={chunk_overlap})")
    text_splitter = RecursiveCharacterTextSplitter.from_language(
        language=Language.PYTHON, chunk_size=chunk_size, chunk_overlap=chunk_overlap
    )
    return text_splitter.split_documents(documents)


def process_document(source):
    """Determine the file type and process the document accordingly."""
    logging.info(f"Processing document: {source}")
    source_lower = source.lower()
    
    if source_lower.endswith(".pdf"):
        return process_pdf(source)
    elif source_lower.endswith((".png", ".jpg", ".jpeg")):
        return process_image(source)
    elif source_lower.startswith("http"):
        # Process URL (Webpage)
        documents = extract_text_from_webpage(source)
        return split_documents(documents)
    else:
        # NOTE: Added 'docx' support to the front-end but no native DOCX loader is included here, 
        # so keeping the error for unsupported types unless the user installs Unstructured for DOCX.
        raise ValueError(f"Unsupported file type: {source}")