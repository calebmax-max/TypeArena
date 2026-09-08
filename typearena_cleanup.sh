#!/usr/bin/env bash
# Run this from the root of your actual local TypeArena clone (where .git lives).
# It removes committed junk, hardens .gitignore, and redacts the leaked DB password.
set -e

echo "Removing tracked files that shouldn't be in git..."
git rm -r --cached __pycache__ backend.py/__pycache__ 2>/dev/null || true
git rm --cached backend-live.err.txt backend-live.out.txt backend-start.err.txt backend-start.out.txt dev.err.txt dev.out.txt static.err.txt static.out.txt 2>/dev/null || true
git rm --cached fggg.py 2>/dev/null || true
git rm --cached faithmutheu1_db 2>/dev/null || true

echo "Hardening .gitignore..."
cat >> .gitignore << 'EOF'

# stray dev artifacts
*.err.txt
*.out.txt
*.db
faithmutheu1_db
EOF

echo "Redacting leaked password in .env.example..."
sed -i.bak 's/ALWAYSDATA_DB_PASSWORD=faith@#!!!!/ALWAYSDATA_DB_PASSWORD=your_alwaysdata_db_password/' .env.example
rm -f .env.example.bak

git add -A
git status --short

echo ""
echo "Review the changes above, then run:"
echo "  git commit -m \"Remove committed logs, pycache, and stray db; redact leaked db password; harden .gitignore\""
echo "  git push"
echo ""
echo "IMPORTANT: this only stops the leak going forward. The old password is still in"
echo "your git history forever. Go rotate the AlwaysData DB password now, separately."