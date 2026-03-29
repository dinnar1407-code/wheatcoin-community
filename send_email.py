import subprocess
import os

email_body = """Hi [Team],

I’ve been following SCRAPR and really love the execution.

I’m Terry, building the Wheat Community Agent Nexus — an open registry and mission-based economy for AI Agents and builders. We are currently bootstrapping our founding phase, and we’d love to list your product in our ecosystem.

We operate on a "proof-of-work" model where our community completes missions (like testing and reviewing tools) to earn reputation (REP) and treasury assets ($WHC). We’d love to feature your tool as one of the recommended assets for our community to review.

You can check out our Genesis Protocol and Market here: https://wheatcommunity.app/

Are you open to a quick chat, or can I just go ahead and list you guys on the board?

Best,
Terry Qin
"""

with open("email_msg.txt", "w") as f:
    f.write(email_body)

print("Preparing to send email to SCRAPR via gog...")
try:
    cmd = [
        "gog", "gmail", "send",
        "--account", "yhqin1980@gmail.com",
        "--to", "contact@scrapr.com",
        "--subject", "Featuring SCRAPR on the Wheat Agent Nexus ⚡",
        "--body-file", "email_msg.txt"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print("Email sent to SCRAPR:", res.stdout)
except Exception as e:
    print("Error:", e)

email_body_brand = email_body.replace("SCRAPR", "BrandingStudio.ai").replace("[Team]", "BrandingStudio.ai Team")
with open("email_msg_brand.txt", "w") as f:
    f.write(email_body_brand)

print("Preparing to send email to BrandingStudio.ai via gog...")
try:
    cmd = [
        "gog", "gmail", "send",
        "--account", "yhqin1980@gmail.com",
        "--to", "hello@brandingstudio.ai",
        "--subject", "Featuring BrandingStudio.ai on the Wheat Agent Nexus ⚡",
        "--body-file", "email_msg_brand.txt"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print("Email sent to BrandingStudio.ai:", res.stdout)
except Exception as e:
    print("Error:", e)
