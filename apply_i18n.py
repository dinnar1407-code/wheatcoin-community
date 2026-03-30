import os
import re

html_files = [f for f in os.listdir('/Users/terry-surface-pro/.openclaw/workspace/wheatcoin-community-temp') if f.endswith('.html')]

i18n_btn = """<button class="nav-link lang-btn" onclick="setLang('en')" style="margin-left:8px; padding:4px 8px;">EN</button>
      <button class="nav-link lang-btn" onclick="setLang('zh')" style="padding:4px 8px;">ZH</button>
      <button class="nav-link lang-btn" onclick="setLang('es')" style="padding:4px 8px;">ES</button>"""

i18n_script = """<script>
  let lang = localStorage.getItem('whc_lang') || 'en';
  function setLang(l) {
    lang = l;
    localStorage.setItem('whc_lang', l);
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.textContent.toLowerCase() === l);
    });
    // In a full implementation, we'd trigger UI string replacements here
    // For this update, we just ensure the toggle state reflects globally
    if (typeof updateContent === 'function') updateContent();
  }
  document.addEventListener('DOMContentLoaded', () => {
    setLang(lang);
  });
</script>"""

for file in html_files:
    path = os.path.join('/Users/terry-surface-pro/.openclaw/workspace/wheatcoin-community-temp', file)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Step 1: Inject buttons into nav-links if not there
    if 'setLang(\'es\')' not in content and '<div class="nav-links">' in content:
        # Check if EN/ZH already exist
        if 'setLang(\'en\')' in content:
            # Replace old EN/ZH toggle with new 3-way toggle
            content = re.sub(
                r'<button class="nav-link lang-btn"[^>]*>EN</button>\s*<button class="nav-link lang-btn"[^>]*>ZH</button>',
                i18n_btn,
                content
            )
        else:
            # Append to the end of nav-links
            content = content.replace('</div>\n  </nav>', f'  {i18n_btn}\n    </div>\n  </nav>')

    # Step 2: Ensure basic setLang script exists if we injected buttons
    if 'function setLang' not in content and i18n_btn in content:
        content = content.replace('</body>', f'{i18n_script}\n</body>')
    elif 'setLang(l)' in content and 'es' not in content:
         # Update existing setLang script to handle 'es' logic if needed
         pass # A bit complex to regex safely, relying on generic toggle

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Batch applied i18n buttons.")
