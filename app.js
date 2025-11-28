// Supabase Configuration
const SUPABASE_URL = "https://gesywvpddosrobajhrks.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlc3l3dnBkZG9zcm9iYWpocmtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTgyNjIsImV4cCI6MjA3OTczNDI2Mn0.zFqvQQuhtNM6hH90IYQUBRxwQuxM2bWQ3F0RDxqEOgg"
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

// Configuration
const DEFAULT_ADMIN_PASSWORD_HASH = "cf4b3535d4a680b42a4b079a9ba9de90dea16ced3b4c5f5bcf5c77a89966a6b9"
const ADMIN_PASSWORD_STORAGE_KEY = "hr-assistant-admin-pass-hash"
let config = {
    geminiKey: "",
    pineconeKey: "",
    pineconeUrl: "",
}

let selectedFiles = []
let isAdminAuthenticated = false
let chatStarted = false

// Initialize app
window.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const page = urlParams.get("page")

    setTimeout(async () => {
        document.getElementById("loading-screen").style.opacity = "0"
        setTimeout(async () => {
            document.getElementById("loading-screen").style.display = "none"

            if (page === "admin") {
                document.getElementById("admin-password-modal").style.display = "flex"
            } else {
                document.getElementById("user-interface").style.display = "block"
                await loadConfig()
            }
        }, 500)
    }, 1500)
})

// Password Protection
function handlePasswordKeyPress(event) {
    if (event.key === "Enter") {
        checkAdminPassword()
    }
}

async function checkAdminPassword() {
    const input = document.getElementById("admin-password-input")
    const password = input.value
    const errorMsg = document.getElementById("password-error")
    const storedHash = await getStoredAdminPasswordHash()
    const hashedInput = await hashString(password)

    if (hashedInput === storedHash) {
        isAdminAuthenticated = true
        document.getElementById("admin-password-modal").style.display = "none"
        document.getElementById("admin-interface").style.display = "block"
        await loadConfig()
        setupDragAndDrop()
    } else {
        errorMsg.classList.remove("hidden")
        input.value = ""
        input.style.borderColor = "#dc2626"
        setTimeout(() => {
            input.style.borderColor = ""
            errorMsg.classList.add("hidden")
        }, 2000)
    }
}

// Configuration Management
async function saveConfig() {
    config.geminiKey = document.getElementById("gemini-key").value.trim()
    config.pineconeKey = document.getElementById("pinecone-key").value.trim()
    config.pineconeUrl = document.getElementById("pinecone-url").value.trim()

    if (!config.geminiKey || !config.pineconeKey || !config.pineconeUrl) {
        showConfigStatus("Please fill in all API configuration fields", "error")
        return
    }

    try {
        // First, check if record with config_key 'default' exists
        const { data: existingData, error: fetchError } = await supabase
            .from('credentials')
            .select('id')
            .eq('config_key', 'default')
            .limit(1)
        
        let result;
        
        if (existingData && existingData.length > 0) {
            // Update existing record
            result = await supabase
                .from('credentials')
                .update({
                    gemini_key: config.geminiKey,
                    pinecone_key: config.pineconeKey,
                    pinecone_url: config.pineconeUrl
                })
                .eq('config_key', 'default')
                .select()
        } else {
            // Insert new record
            result = await supabase
                .from('credentials')
                .insert({
                    config_key: 'default',
                    gemini_key: config.geminiKey,
                    pinecone_key: config.pineconeKey,
                    pinecone_url: config.pineconeUrl
                })
                .select()
        }

        const { data, error } = result;
        
        if (error) {
            console.error("Failed to save config:", error)
            showConfigStatus("Failed to save configuration", "error")
            return
        }

        console.log("Config saved successfully:", data)
        showConfigStatus("Configuration saved successfully!", "success")
    } catch (error) {
        console.error("Error saving config to Supabase:", error)
        showConfigStatus("Failed to save configuration", "error")
    }
}

async function loadConfig() {
    try {
        const { data, error } = await supabase
            .from('credentials')
            .select('gemini_key, pinecone_key, pinecone_url')
            .eq('config_key', 'default')
            .single()
        
        if (error || !data) {
            console.log("No credentials in Supabase yet")
            return
        }

        config.geminiKey = data.gemini_key
        config.pineconeKey = data.pinecone_key
        config.pineconeUrl = data.pinecone_url

        // Update admin panel inputs if visible
        const geminiInput = document.getElementById("gemini-key")
        const pineconeKeyInput = document.getElementById("pinecone-key")
        const pineconeUrlInput = document.getElementById("pinecone-url")

        if (geminiInput) geminiInput.value = config.geminiKey
        if (pineconeKeyInput) pineconeKeyInput.value = config.pineconeKey
        if (pineconeUrlInput) pineconeUrlInput.value = config.pineconeUrl
    } catch (error) {
        console.error("Error loading config from Supabase:", error)
    }
}

// Admin Navigation
function switchAdminTab(tab) {
    document.querySelectorAll(".admin-nav-btn").forEach((btn) => btn.classList.remove("active"))
    document.querySelectorAll(".admin-tab").forEach((tabEl) => {
        tabEl.classList.remove("active")
        tabEl.classList.add("hidden")
    })

    document.getElementById(`${tab}-nav`).classList.add("active")
    const activeTab = document.getElementById(`${tab}-tab`)
    activeTab.classList.add("active")
    activeTab.classList.remove("hidden")
}

// Quick Question Helper
function askQuickQuestion(question) {
    const welcome = document.querySelector(".welcome-hero")
    if (welcome) welcome.remove()

    const input = document.getElementById("user-chat-input")
    input.value = question
    sendUserMessage()
}

// ============================================
// USER CHAT FUNCTIONS
// ============================================

function handleUserChatKeyPress(event) {
    if (event.key === "Enter") {
        sendUserMessage()
    }
}

async function sendUserMessage() {
    const input = document.getElementById("user-chat-input")
    const sendBtn = document.querySelector(".send-btn")
    const question = input.value.trim()

    if (!question) return

    if (!config.geminiKey || !config.pineconeKey || !config.pineconeUrl) {
        addUserChatMessage("Please contact your administrator to configure the system.", "bot")
        return
    }

    // Remove welcome message if exists
    const welcome = document.querySelector(".welcome-hero")
    if (welcome) welcome.remove()

    // Mark chat as started to disable background animation
    markChatStarted()

    // Add user message
    addUserChatMessage(question, "user")
    input.value = ""

    // Disable input while processing
    input.disabled = true
    sendBtn.disabled = true
    input.placeholder = "Assistant is thinking..."
    sendBtn.style.opacity = "0.5"
    sendBtn.style.cursor = "not-allowed"

    // Show thinking indicator
    const thinkingId = addUserChatMessage("Thinking...", "bot")

    try {
        const answer = await processQuestion(question)
        updateChatMessage(thinkingId, answer)
    } catch (error) {
        updateChatMessage(thinkingId, `Error: ${error.message}`)
        console.error(error)
    } finally {
        // Re-enable input after response
        input.disabled = false
        sendBtn.disabled = false
        input.placeholder = "Ask anything about company policies..."
        sendBtn.style.opacity = "1"
        sendBtn.style.cursor = "pointer"
        input.focus()
    }
}

function markChatStarted() {
    if (chatStarted) return
    chatStarted = true
    document.body.classList.add("chat-started")
}

function addUserChatMessage(text, role) {
    const wrapper = document.querySelector(".messages-wrapper")
    // Use more unique ID with timestamp and random number to prevent collisions
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const messageDiv = document.createElement("div")
    messageDiv.className = `chat-message ${role}`
    messageDiv.id = messageId
    // Store role as data attribute for verification
    messageDiv.setAttribute("data-role", role)

    const headerDiv = document.createElement("div")
    headerDiv.className = "message-header"

    const avatarDiv = document.createElement("div")
    avatarDiv.className = "avatar"
    avatarDiv.textContent = role === "user" ? "You" : "Assistant"

    headerDiv.appendChild(avatarDiv)

    const contentDiv = document.createElement("div")
    contentDiv.className = "message-content"
    // Use innerHTML for bot messages to support formatting, textContent for user messages
    if (role === "bot") {
        const html = markdownToHtml(text)
        contentDiv.innerHTML = html
    } else {
        contentDiv.textContent = text
    }

    messageDiv.appendChild(headerDiv)
    messageDiv.appendChild(contentDiv)
    wrapper.appendChild(messageDiv)

    // Scroll to bottom
    const container = document.getElementById("user-chat-messages")
    container.scrollTop = container.scrollHeight

    return messageId
}

function updateChatMessage(messageId, text) {
    const message = document.getElementById(messageId)
    if (message) {
        // CRITICAL: Verify this is a bot message before updating
        const dataRole = message.getAttribute("data-role")
        const hasBotClass = message.classList.contains("bot")

        // Only update if it's confirmed to be a bot message
        if (!hasBotClass && dataRole !== "bot") {
            console.error("Attempted to update non-bot message:", messageId, "Role:", dataRole, "Classes:", message.className)
            return
        }

        // Double-check the message class contains "bot"
        if (!message.classList.contains("bot")) {
            console.error("Message does not have bot class:", messageId)
            return
        }

        const content = message.querySelector(".message-content")
        if (content) {
            // Convert markdown to HTML for bot messages
            const html = markdownToHtml(text)
            content.innerHTML = html
        }
    }
    const container = document.getElementById("user-chat-messages")
    if (container) container.scrollTop = container.scrollHeight
}

// ============================================
// SHARED CHAT PROCESSING
// ============================================

// ============================================
// IMPROVED RETRIEVAL & PROMPT ENGINEERING
// ============================================

// Generate multiple query variations for better retrieval (FREE TIER OPTIMIZED - 3-4 variations max)
async function generateQueryVariations(question) {
    const variations = [
        question, // Original
    ]

    // Add common synonyms and variations (LIMITED to 3-4 max per category for free tier)
    const questionLower = question.toLowerCase()
    
    if (questionLower.includes("leave") || questionLower.includes("vacation")) {
        variations.push("leave policy entitlement")
        variations.push("how many days off per year")
    }
    
    if (questionLower.includes("holiday") || questionLower.includes("festival")) {
        variations.push("holidays calendar dates")
        variations.push("list of company holidays")
    }
    
    if (questionLower.includes("sick") || questionLower.includes("medical") || questionLower.includes("insurance")) {
        variations.push("medical insurance health coverage")
        variations.push("health benefits policy")
    }
    
    if (questionLower.includes("remote") || questionLower.includes("work from home") || questionLower.includes("wfh")) {
        variations.push("remote work guidelines")
        variations.push("work from home policy")
    }
    
    if (questionLower.includes("benefit")) {
        variations.push("employee benefits package")
        variations.push("perks and benefits")
    }
    
    if (questionLower.includes("salary") || questionLower.includes("compensation") || questionLower.includes("pay")) {
        variations.push("salary structure payment")
        variations.push("compensation policy")
    }
    
    if (questionLower.includes("timing") || questionLower.includes("time") || questionLower.includes("working hours") || questionLower.includes("office hours")) {
        variations.push("work timings schedule hours")
        variations.push("office hours policy")
    }
    
    if (questionLower.includes("attendance") || questionLower.includes("check-in")) {
        variations.push("attendance policy marking")
        variations.push("check-in requirements")
    }

    // Cap variations at 3 to optimize for free tier (1 original + 2 variations max)
    return variations.slice(0, 3)
}

// Multi-query retrieval for better context (FREE TIER OPTIMIZED)
async function multiQueryRetrieval(question) {
    try {
        const variations = await generateQueryVariations(question)
        console.log("Query variations (max 3):", variations)
        
        const allResults = []
        const seenIds = new Set()

        // Retrieve for each variation
        for (const variation of variations) {
            try {
                const embedding = await getEmbedding(variation)
                const docs = await queryPinecone(embedding)
                
                console.log(`Retrieved ${docs ? docs.length : 0} docs for: "${variation}"`)
                
                // Filter by similarity and deduplicate
                if (docs && docs.length > 0) {
                    for (const doc of docs) {
                        // Threshold: 0.50 - lenient for better coverage
                        if (doc.score >= 0.50 && !seenIds.has(doc.id)) {
                            seenIds.add(doc.id)
                            allResults.push(doc)
                        }
                    }
                }
            } catch (error) {
                console.warn("Error retrieving for variation:", variation, error)
            }
        }

        // Sort by score and return top 3 (reduced from 5 to save token usage)
        allResults.sort((a, b) => b.score - a.score)
        const finalResults = allResults.slice(0, 3)
        console.log(`Final: ${finalResults.length} docs | Total attempts: ${variations.length}`)
        return finalResults
    } catch (error) {
        console.error("Error in multi-query retrieval:", error)
        // Fallback to single query
        const embedding = await getEmbedding(question)
        return await queryPinecone(embedding)
    }
}

async function processQuestion(question) {
    // Use improved multi-query retrieval (optimized for free tier)
    const docs = await multiQueryRetrieval(question)

    if (!docs || docs.length === 0) {
        return "I couldn't find any relevant information in the knowledge base."
    }

    // Build context efficiently (reduced context size for token optimization)
    const context = docs
        .map((d) => d.metadata.text)
        .join("\n\n")

    // Detect if user wants brief summary/quick answer
    const questionLower = question.toLowerCase()
    
    // Comprehensive list of brief/concise request keywords
    const briefKeywords = [
        // Single words for conciseness
        "brief", "summary", "concise", "short", "quick", "simple", "just", 
        "tldr", "gist", "essence", "crux", "basics", "outline", "snapshot", 
        "overview", "digest", "abbreviated", "abridged", "condensed",
        
        // Common phrases
        "list only", "one line", "in one sentence", "in short", "in brief",
        "briefly", "quickly", "fast answer", "short version", "simplified",
        "plain language", "eli5", "explain like i'm 5", "don't need details",
        "sum up", "condense", "highlights only", "key points only", "essentials only",
        "bottom line", "cliff notes", "spark notes",
        
        // Negative/Direct phrasing
        "don't elaborate", "no details", "skip details", "no lengthy",
        "no explanation", "straightforward", "to the point", "straight answer",
        "no fluff", "just the facts", "facts only", "keep it simple",
        "simplify", "minimal", "bare minimum", "essential only",
        
        // Question format shortcuts
        "what is", "what are", "tell me", "show me", "list",
        "types of", "kinds of", "examples of", "types", "kinds"
    ]
    
    const isBriefRequest = briefKeywords.some(keyword => questionLower.includes(keyword))

    // Adjust prompt based on request type
    let prompt
    if (isBriefRequest) {
        prompt = `You are an HR Assistant for Krish Technolabs. Answer based ONLY on provided context.

RESPONSE FORMAT - CRITICAL:
- Keep answer SHORT and CONCISE (1-3 lines max)
- Use • for simple lists
- No long explanations
- Be direct and to the point

CONTEXT:
${context}

QUESTION: ${question}

BRIEF ANSWER (1-3 lines):`
    } else {
        prompt = `You are an HR Assistant for Krish Technolabs. Answer based ONLY on provided context. YOUR RESPONSE MUST BE WELL-STRUCTURED AND EASY TO READ.

FORMATTING RULES - STRICTLY FOLLOW FOR CLARITY:

1. **MAIN TITLE**: Use ## (h2) for main topic title
2. **SUBTITLES**: Use ### (h3) for sections and subsections
3. **LISTS**: Use proper formatting:
   - First level: • (bullet points)
   - Second level: ◦ (sub-bullets, indented)
   - Use bold for key terms within bullets
4. **KEY INFORMATION**: Use **bold** for important details
5. **STRUCTURE**: 
   - Overview paragraph first (2-3 lines)
   - Then organized sections with clear hierarchy
   - Use tables for comparative/structured data
6. **SPACING**: Add blank lines between sections for readability
7. **EMPHASIS**: Use italics *like this* for supporting info

EXAMPLE FORMAT:
## Leave Policy

**Overview**: This policy outlines entitlements and procedures...

### Types of Leaves
• **Paid Leave**: 18 days per year
  ◦ Permanent employees only
  ◦ Accrues at 1.5 days/month
• **Sick Leave**: 5 days per year
• **Casual Leave**: As per requirement

### Approval Process
1. Submit request to manager
2. Manager approves
3. HR processes (1 day)

Do NOT output wall of text. Always structure with headers, lists, and proper formatting.

CONTEXT:
${context}

QUESTION: ${question}

WELL-FORMATTED ANSWER:`
    }

    return await generateWithGemini(prompt)
}

// ============================================
// FILE UPLOAD FUNCTIONS
// ============================================

function setupDragAndDrop() {
    const dropZone = document.getElementById("drop-zone")
    if (!dropZone) return

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault()
        dropZone.style.borderColor = "var(--accent-color)"
    })

    dropZone.addEventListener("dragleave", () => {
        dropZone.style.borderColor = ""
    })

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault()
        dropZone.style.borderColor = ""
        const files = Array.from(e.dataTransfer.files)
        handleFiles(files)
    })

    dropZone.addEventListener("click", () => {
        document.getElementById("file-input").click()
    })
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files)
    handleFiles(files)
}

function handleFiles(files) {
    selectedFiles = files.filter((f) => f.name.endsWith(".pdf") || f.name.endsWith(".docx"))

    displayFileList()
    const btn = document.getElementById("process-files-btn")
    if (btn) btn.style.display = selectedFiles.length > 0 ? "block" : "none"
}

function displayFileList() {
    const fileList = document.getElementById("file-list")
    if (!fileList) return

    fileList.innerHTML = ""

    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement("div")
        fileItem.className = "file-item"
        const fileInfo = document.createElement("div")
        fileInfo.className = "file-info"
        fileInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(2)} KB)`

        const btn = document.createElement("button")
        btn.className = "btn-secondary"
        btn.textContent = "Remove"
        btn.style.padding = "6px 12px"
        btn.style.fontSize = "12px"
        btn.onclick = () => removeFile(index)

        fileItem.appendChild(fileInfo)
        fileItem.appendChild(btn)
        fileList.appendChild(fileItem)
    })
}

function removeFile(index) {
    selectedFiles.splice(index, 1)
    displayFileList()
    const btn = document.getElementById("process-files-btn")
    if (btn) btn.style.display = selectedFiles.length > 0 ? "block" : "none"
}

async function getStoredAdminPasswordHash() {
    try {
        const { data, error } = await supabase
            .from('admin_passkey')
            .select('passkey_hash')
            .order('id', { ascending: false })
            .limit(1)
        
        if (error) {
            console.error("Error fetching passkey from Supabase:", error)
            return DEFAULT_ADMIN_PASSWORD_HASH
        }

        if (!data || data.length === 0) {
            console.log("No passkey in Supabase, using default")
            return DEFAULT_ADMIN_PASSWORD_HASH
        }

        console.log("Passkey fetched from Supabase:", data[0])
        return data[0].passkey_hash
    } catch (error) {
        console.warn("Error fetching passkey from Supabase:", error)
        return DEFAULT_ADMIN_PASSWORD_HASH
    }
}

async function setStoredAdminPasswordHash(hash) {
    try {
        // First, get the existing record to update it, or create if doesn't exist
        const { data: existingData, error: fetchError } = await supabase
            .from('admin_passkey')
            .select('id')
            .limit(1)
        
        let result;
        
        if (existingData && existingData.length > 0) {
            // Update existing record
            const existingId = existingData[0].id;
            result = await supabase
                .from('admin_passkey')
                .update({ passkey_hash: hash })
                .eq('id', existingId)
                .select()
        } else {
            // Insert new record (let database generate ID)
            result = await supabase
                .from('admin_passkey')
                .insert({ passkey_hash: hash })
                .select()
        }

        const { data, error } = result;
        
        if (error) {
            console.error("Failed to save passkey to Supabase:", error)
            throw new Error(`Supabase error: ${error.message}`)
        }

        console.log("Passkey saved successfully:", data)
        return true
    } catch (error) {
        console.error("Error saving passkey to Supabase:", error)
        showAdminPassStatus("Failed to save passkey", "error")
        return false
    }
}

async function processFiles() {
    if (!config.geminiKey || !config.pineconeKey || !config.pineconeUrl) {
        showUploadStatus("Please configure API keys first", "error")
        return
    }

    showUploadStatus("Processing files...", "info")

    try {
        let allChunks = []

        for (const file of selectedFiles) {
            const text = await extractTextFromFile(file)
            const chunks = chunkText(text, file.name)
            allChunks = allChunks.concat(chunks)
        }

        await uploadToPinecone(allChunks)

        showUploadStatus(
            `Successfully processed ${selectedFiles.length} file(s) and added ${allChunks.length} chunks!`,
            "success",
        )
        selectedFiles = []
        displayFileList()
        const btn = document.getElementById("process-files-btn")
        if (btn) btn.style.display = "none"
    } catch (error) {
        showUploadStatus(`Error: ${error.message}`, "error")
        console.error(error)
    }
}

// ============================================
// DOCUMENT PROCESSING
// ============================================

async function extractTextFromFile(file) {
    if (file.name.endsWith(".pdf")) {
        return await extractTextFromPDF(file)
    } else if (file.name.endsWith(".docx")) {
        return await extractTextFromDOCX(file)
    }
}

async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
    let text = ""

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items.map((item) => item.str).join(" ")
        text += pageText + "\n\n"
    }

    return text
}

async function extractTextFromDOCX(file) {
    const arrayBuffer = await file.arrayBuffer()
    const result = await window.mammoth.extractRawText({ arrayBuffer })
    return result.value
}

async function updateAdminPassword() {
    const currentInput = document.getElementById("current-admin-pass")
    const newInput = document.getElementById("new-admin-pass")
    const confirmInput = document.getElementById("confirm-admin-pass")
    const statusEl = document.getElementById("admin-pass-status")

    if (!currentInput || !newInput || !confirmInput || !statusEl) return

    const currentPass = currentInput.value.trim()
    const newPass = newInput.value.trim()
    const confirmPass = confirmInput.value.trim()

    if (!currentPass || !newPass || !confirmPass) {
        showAdminPassStatus("Please fill in all fields", "error")
        return
    }

    if (newPass.length < 8) {
        showAdminPassStatus("New passkey must be at least 8 characters long", "error")
        return
    }

    if (newPass !== confirmPass) {
        showAdminPassStatus("New passkey and confirmation do not match", "error")
        return
    }

    const storedHash = await getStoredAdminPasswordHash()
    const currentHash = await hashString(currentPass)

    if (currentHash !== storedHash) {
        showAdminPassStatus("Current passkey is incorrect", "error")
        return
    }

    const newHash = await hashString(newPass)
    const success = await setStoredAdminPasswordHash(newHash)

    if (success) {
        currentInput.value = ""
        newInput.value = ""
        confirmInput.value = ""
        showAdminPassStatus("Admin passkey updated successfully!", "success")
    }
}

function chunkText(text, source) {
    const chunkSize = 1000
    const overlap = 200
    const chunks = []

    for (let i = 0; i < text.length; i += chunkSize - overlap) {
        const chunk = text.slice(i, i + chunkSize)
        if (chunk.trim()) {
            chunks.push({
                text: chunk,
                metadata: { source },
            })
        }
    }

    return chunks
}

// ============================================
// API FUNCTIONS
// ============================================

async function getEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${config.geminiKey}`

    // UPDATED: Use fetchWithRetry
    const response = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "models/text-embedding-004",
            content: { parts: [{ text }] },
        }),
    })

    if (!response.ok) {
        if (response.status === 429) {
            throw new Error("System is not up, please contact your administrator.")
        }
        const error = await response.json()
        if (error.error?.message?.includes("RESOURCE_EXHAUSTED") || error.error?.message?.toLowerCase().includes("quota")) {
            throw new Error("System is not up, please contact your administrator.")
        }
        throw new Error("System is not up, please contact your administrator.")
    }

    const data = await response.json()
    return data.embedding.values
}

async function getEmbeddings(texts) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${config.geminiKey}`

    const batchSize = 20
    let allEmbeddings = []

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize)

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requests: batch.map((text) => ({
                    model: "models/text-embedding-004",
                    content: { parts: [{ text }] },
                })),
            }),
        })

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error("System is not up, please contact your administrator.")
            }
            const error = await response.json()
            if (error.error?.message?.includes("RESOURCE_EXHAUSTED") || error.error?.message?.toLowerCase().includes("quota")) {
                throw new Error("System is not up, please contact your administrator.")
            }
            throw new Error(`Failed to get embeddings: ${error.error?.message || "Unknown error"}`)
        }

        const data = await response.json()
        const embeddings = data.embeddings.map((e) => e.values)
        allEmbeddings = allEmbeddings.concat(embeddings)

        if (i + batchSize < texts.length) {
            await new Promise((resolve) => setTimeout(resolve, 1500))
        }
    }

    return allEmbeddings
}

async function generateWithGemini(prompt) {

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${config.geminiKey}`

    const response = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0 },
        }),
    })

    if (!response.ok) {
        if (response.status === 429) {
            throw new Error("System is not up, please contact your administrator.")
        }
        const error = await response.json()
        if (error.error?.message?.includes("RESOURCE_EXHAUSTED") || error.error?.message?.toLowerCase().includes("quota")) {
            throw new Error("System is not up, please contact your administrator.")
        }
        throw new Error("System is not up, please contact your administrator.")
    }

    const data = await response.json()
    return data.candidates[0].content.parts[0].text
}

async function queryPinecone(embedding) {
    const url = `${config.pineconeUrl}/query`

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Api-Key": config.pineconeKey,
            "Content-Type": "application/json",
            "X-Pinecone-API-Version": "2024-07",
        },
        body: JSON.stringify({
            vector: embedding,
            topK: 5,
            includeMetadata: true,
            includeValues: false,
            namespace: "",
        }),
    })

    if (!response.ok) throw new Error("Failed to query Pinecone")

    const data = await response.json()
    return data.matches || []
}

async function uploadToPinecone(chunks) {
    const batchSize = 100
    const texts = chunks.map((c) => c.text)
    const embeddings = await getEmbeddings(texts)

    const vectors = chunks.map((chunk, i) => ({
        id: `doc-${Date.now()}-${i}`,
        values: embeddings[i],
        metadata: {
            text: chunk.text,
            source: chunk.metadata.source,
        },
    }))

    const url = `${config.pineconeUrl}/vectors/upsert`

    for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize)

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Api-Key": config.pineconeKey,
                "Content-Type": "application/json",
                "X-Pinecone-API-Version": "2024-07",
            },
            body: JSON.stringify({
                vectors: batch,
                namespace: "",
            }),
        })

        if (!response.ok) throw new Error("Failed to upload to Pinecone")
    }
}

async function hashString(text) {
    if (!window.crypto || !window.crypto.subtle) {
        throw new Error("Secure hashing is not supported in this browser.")
    }

    const encoder = new TextEncoder()
    const data = encoder.encode(text)
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Helper function to retry failed API calls
async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);

            // If successful, return the response immediately
            if (response.ok) return response;

            // If it's a Quota error (429) or Service Unavailable (503), wait and retry
            if (response.status === 429 || response.status === 503) {
                console.warn(`Attempt ${i + 1} failed (Status ${response.status}). Retrying...`);
                // Wait 2 seconds * attempt number (Exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
                continue;
            }

            // If it's another error (like 401 Bad Key), don't retry, just return response
            return response;

        } catch (error) {
            console.error(`Attempt ${i + 1} network error:`, error);
            if (i === retries - 1) throw error; // Throw error on final attempt
        }
    }
    throw new Error('Max retries reached. System busy.');
}

// ============================================
// MARKDOWN TO HTML CONVERTER (using marked.js)
// ============================================

function markdownToHtml(markdown) {
    if (!markdown) return ""

    // Check if marked is available
    if (typeof marked === 'undefined') {
        console.warn('marked.js not loaded, falling back to plain text')
        return escapeHtml(markdown)
    }

    // Configure marked options for better formatting
    marked.setOptions({
        breaks: true, // Convert \n to <br>
        gfm: true, // GitHub Flavored Markdown (tables, strikethrough, etc.)
        headerIds: false, // Disable header IDs for cleaner HTML
        mangle: false // Don't mangle email addresses
    })

    try {
        // Parse markdown to HTML
        const html = marked.parse(markdown)
        return html
    } catch (error) {
        console.error('Error parsing markdown:', error)
        // Fallback to escaped text if parsing fails
        return escapeHtml(markdown)
    }
}

function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

// ============================================
// UI HELPERS
// ============================================

function showUploadStatus(message, type) {
    const statusDiv = document.getElementById("upload-status")
    if (!statusDiv) return

    statusDiv.textContent = message
    statusDiv.className = `status-message ${type}`

    setTimeout(() => {
        statusDiv.className = "status-message hidden"
    }, 5000)
}

function showConfigStatus(message, type) {
    const statusDiv = document.getElementById("config-status")
    if (!statusDiv) return

    statusDiv.textContent = message
    statusDiv.className = `status-message ${type}`

    setTimeout(() => {
        statusDiv.className = "status-message hidden"
    }, 5000)
}

function showAdminPassStatus(message, type) {
    const statusDiv = document.getElementById("admin-pass-status")
    if (!statusDiv) return

    statusDiv.textContent = message
    statusDiv.className = `status-message ${type}`

    setTimeout(() => {
        statusDiv.className = "status-message hidden"
    }, 5000)
}