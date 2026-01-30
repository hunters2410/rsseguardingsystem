
import os
import subprocess
import sys

def print_banner(text):
    print("\n" + "="*50)
    print(f" {text}")
    print("="*50)

def run_command(command, description):
    print(f"[*] {description}...")
    try:
        subprocess.run(command, shell=True, check=True)
        print(f"[+] Successfully {description.lower()}")
    except subprocess.CalledProcessError as e:
        print(f"[-] Failed to {description.lower()}: {e}")
        return False
    return True

def main():
    print_banner("REAL STAR SECURITY - SYSTEM SETUP")
    
    # 1. Check for Node.js
    if not run_command("node --version", "Checking Node.js version"):
        print("Please install Node.js from https://nodejs.org/")
        return

    # 2. Install Frontend Dependencies
    if not run_command("npm install", "Installing frontend dependencies"):
        return

    # 3. Setup Python Virtual Environment or requirements
    print_banner("AI ENGINE SETUP")
    if not run_command("pip install -r ai-server/requirements.txt", "Installing AI server requirements"):
        print("Warning: Failed to install python requirements. Ensure python is in your PATH.")

    # 4. Environment Variables
    if not os.path.exists(".env"):
        print_banner("ENVIRONMENT CONFIGURATION")
        print("The .env file is missing. Let me create a template for you.")
        with open(".env", "w") as f:
            f.write("VITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY=\nSUPABASE_SERVICE_ROLE_KEY=\n")
        print("[+] Created .env template. Please open it and paste your Supabase keys.")
    else:
        print("[+] .env file found.")

    # 5. Final Instructions
    print_banner("SETUP COMPLETE")
    print("To start the system, open three terminals and run:")
    print("1. Terminal: npm run dev    (Dashboard)")
    print("2. Terminal: npm run stream (Streaming Engine)")
    print("3. Terminal: npm run ai-server (AI Engine)")
    print("="*50)

if __name__ == "__main__":
    main()
