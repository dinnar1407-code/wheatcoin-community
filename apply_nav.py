import os
import re

html_files = [f for f in os.listdir('/Users/terry-surface-pro/.openclaw/workspace/wheatcoin-community-temp') if f.endswith('.html')]

# Ensure every page has the full consistent nav links
for file in html_files:
    if file == 'admin.html': continue # Admin has custom nav style due to padding
    path = os.path.join('/Users/terry-surface-pro/.openclaw/workspace/wheatcoin-community-temp', file)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    if '<div class="nav-links">' in content:
        # Check if the nav links are fully updated
        if 'href="/admin"' not in content:
            # We insert the admin link right before the language toggles
            content = content.replace(
                '<button class="nav-link lang-btn"', 
                '<a href="/admin" class="nav-link" style="color:var(--muted)">Admin</a>\n      <button class="nav-link lang-btn"',
                1
            )
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)

print("Batch applied admin nav links.")
