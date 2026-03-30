import os

html_files = [f for f in os.listdir('/Users/terry-surface-pro/.openclaw/workspace/wheatcoin-community-temp') if f.endswith('.html')]

# We want to add the Agent link right before the Finance link
for file in html_files:
    if file == 'admin.html' or file == 'agent_chat.html': continue
    path = os.path.join('/Users/terry-surface-pro/.openclaw/workspace/wheatcoin-community-temp', file)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    if '<a href="/finance" class="btn-login"' in content and '<a href="/agent" class="nav-link">AI Assistant</a>' not in content:
        content = content.replace(
            '<a href="/finance" class="btn-login"',
            '<a href="/agent" class="nav-link" style="color:var(--gold)">AI Assistant</a>\n      <a href="/finance" class="btn-login"',
            1
        )
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

print("Batch applied agent nav links.")
