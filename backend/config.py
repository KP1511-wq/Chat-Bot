import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

# 1. Load the variables from the .env config file
load_dotenv()

# 2. Retrieve ONLY the key from the environment
api_key = os.getenv("GOOGLE_API_KEY")

# 3. Initialize the Google AI Model
if not api_key:
    print("⚠️ ERROR: GOOGLE_API_KEY is missing from the .env file!")
    model = None
else:
    print("🚀 Connecting to Google AI...")
    model = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash", 
        google_api_key=api_key,
        temperature=0 
    )