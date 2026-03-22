import os
import sys
import shutil
from pathlib import Path

def main():
    if len(sys.argv) < 2:
        print("=========================================================")
        print("Использование: python switch_account.py <имя_профиля>")
        print("Пример:        python switch_account.py work")
        print("Возврат назад: python switch_account.py default")
        print("=========================================================")
        sys.exit(1)

    target_profile = sys.argv[1].lower()
    root_dir = Path.home()
    
    # Paths to the default directories used by NotebookLM tools
    nl_py_path = root_dir / ".notebooklm"
    nl_mcp_path = root_dir / ".notebooklm-mcp"
    profile_marker = nl_py_path / "current_profile.txt"
    
    # Determine current profile
    current_profile = "default"
    if profile_marker.exists():
        current_profile = profile_marker.read_text().strip()
    
    if current_profile == target_profile:
        print(f"[*] Profile '{target_profile}' is already active.")
        sys.exit(0)
    
    print(f"[*] Switching profile: {current_profile} -> {target_profile}")
    
    # 1. Back up current profile directories
    nl_py_backup = root_dir / f".notebooklm_{current_profile}"
    nl_mcp_backup = root_dir / f".notebooklm-mcp_{current_profile}"
    
    if nl_py_path.exists():
        if nl_py_backup.exists():
            shutil.rmtree(nl_py_backup)
        nl_py_path.rename(nl_py_backup)
        print(f"  [+] Saved {current_profile} (.notebooklm)")
        
    if nl_mcp_path.exists():
        if nl_mcp_backup.exists():
            shutil.rmtree(nl_mcp_backup)
        nl_mcp_path.rename(nl_mcp_backup)
        print(f"  [+] Saved {current_profile} (.notebooklm-mcp)")

    # 2. Restore or create target profile directories
    nl_py_restore = root_dir / f".notebooklm_{target_profile}"
    nl_mcp_restore = root_dir / f".notebooklm-mcp_{target_profile}"
    
    if nl_py_restore.exists():
        nl_py_restore.rename(nl_py_path)
        print(f"  [+] Loaded {target_profile} (.notebooklm)")
    else:
        nl_py_path.mkdir(parents=True, exist_ok=True)
        print(f"  [+] Created empty profile {target_profile} (.notebooklm)")
        
    if nl_mcp_restore.exists():
        nl_mcp_restore.rename(nl_mcp_path)
        print(f"  [+] Loaded {target_profile} (.notebooklm-mcp)")
    else:
        nl_mcp_path.mkdir(parents=True, exist_ok=True)
        print(f"  [+] Created empty profile {target_profile} (.notebooklm-mcp)")

    # 3. Write marker for future runs
    profile_marker.write_text(target_profile)
    
    print(f"\n[OK] Profile changed to '{target_profile}'.")
    
    # Check if this profile needs authentication (if storage_state.json is missing in .notebooklm)
    needs_auth = not (nl_py_path / "storage_state.json").exists()
    
    if needs_auth:
        print(f"\n[!] WARNING: New profile! Authentication required:")
        print("   1. Run 'notebooklm login' and sign into your account.")
        print("   2. Restart AntiGravity/server after this.")
    else:
        print(f"\n[!] IMPORTANT: Profile switched.")
        print("   RESTART AntiGravity to pick up new tokens!")

if __name__ == "__main__":
    main()
