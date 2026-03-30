import os
import re

html_files = ['talent.html', 'finance.html']
for file in html_files:
    path = os.path.join('/Users/terry-surface-pro/.openclaw/workspace/wheatcoin-community-temp', file)
    if not os.path.exists(path): continue
    
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Define minimal dictionary and replace text logic
    dict_script = """
<script>
  const DICT = {
    en: {
      talentHub: "Industrial Automation Hub · US/CA/MX",
      talentSub: "The AI-powered marketplace connecting Foremen with Elite Independent Engineers across the US, Canada, and Mexico.",
      tabProj: "Browse Projects (For Engineers)",
      tabTalent: "Browse Engineers (For Foremen)",
      btnPost: "Post Project",
      btnPublish: "Publish Profile"
    },
    zh: {
      talentHub: "工业自动化服务大厅 · 北美出海",
      talentSub: "由AI驱动的双边市场，连接中国出海设备供应商与美加墨当地精英工程师。",
      tabProj: "浏览项目 (工程师入口)",
      tabTalent: "找当地人才 (包工头/供应商入口)",
      btnPost: "发布项目需求",
      btnPublish: "发布工程师简历"
    },
    es: {
      talentHub: "Centro de Automatización Industrial · US/CA/MX",
      talentSub: "El mercado impulsado por IA que conecta capataces con ingenieros independientes de élite.",
      tabProj: "Ver Proyectos (Para Ingenieros)",
      tabTalent: "Ver Ingenieros (Para Capataces)",
      btnPost: "Publicar Proyecto",
      btnPublish: "Publicar Perfil"
    }
  };

  let lang = localStorage.getItem('whc_lang') || 'en';
  function setLang(l) {
    lang = l;
    localStorage.setItem('whc_lang', l);
    
    // Update button visual state
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.style.background = b.textContent.toLowerCase() === l ? 'var(--purple)' : 'transparent';
      b.style.color = b.textContent.toLowerCase() === l ? '#fff' : 'var(--muted)';
      b.style.borderColor = b.textContent.toLowerCase() === l ? 'var(--purple)' : 'var(--border)';
    });

    // Update basic text nodes (MVP translation)
    if(document.getElementById('hubTitle')) document.getElementById('hubTitle').textContent = DICT[l].talentHub;
    if(document.getElementById('hubSub')) document.getElementById('hubSub').textContent = DICT[l].talentSub;
    if(document.getElementById('tabProjects')) document.getElementById('tabProjects').textContent = DICT[l].tabProj;
    if(document.getElementById('tabTalent')) document.getElementById('tabTalent').textContent = DICT[l].tabTalent;
    if(document.getElementById('submitJobBtn')) document.getElementById('submitJobBtn').textContent = DICT[l].btnPost;
    if(document.getElementById('submitTalentBtn')) document.getElementById('submitTalentBtn').textContent = DICT[l].btnPublish;
  }

  document.addEventListener('DOMContentLoaded', () => {
    setLang(lang);
  });
</script>
"""

    if file == 'talent.html':
        content = content.replace('<h1>Industrial Automation Hub · US/CA/MX</h1>', '<h1 id="hubTitle">Industrial Automation Hub · US/CA/MX</h1>')
        content = content.replace('<p>The AI-powered marketplace connecting Foremen (Project Owners) with Elite Independent Engineers across the US, Canada, and Mexico.</p>', '<p id="hubSub">The AI-powered marketplace connecting Foremen (Project Owners) with Elite Independent Engineers across the US, Canada, and Mexico.</p>')
        
        # Replace the old dummy script
        content = re.sub(r'<script>\s*let lang = localStorage.getItem[\s\S]*?</script>', dict_script, content)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Applied active i18n logic to talent page.")
