import json, urllib.request

with open('server/seed-data/projects.seed.json', 'r', encoding='utf-8') as f:
    projects = json.load(f)

print(f"Pushing {len(projects[0]['parsedVOCs'])} VOCs...")

# Wake server
try:
    urllib.request.urlopen('https://yongyan.onrender.com/api/projects', timeout=90)
    print("Server awake")
except Exception as e:
    print(f"Wake: {e}")

# Push
data = json.dumps({'projects': projects}).encode('utf-8')
req = urllib.request.Request('https://yongyan.onrender.com/api/projects/sync', data=data, headers={'Content-Type': 'application/json'}, method='POST')
resp = urllib.request.urlopen(req, timeout=60)
print(f"Result: {resp.read().decode()}")
