#!/bin/bash

# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: ShiFi Loan Origination System"

# Instructions for adding remote repository
echo "Repository initialized!"
echo "To push to GitHub, run these commands:"
echo "1. git remote add origin <your-github-repo-url>"
echo "2. git push -u origin main"
