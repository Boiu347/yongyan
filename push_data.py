import json, urllib.request

with open('server/seed-data/projects.seed.json', 'r', encoding='utf-8') as f:
    projects = json.load(f)

print(f"VOCs: {len(projects[0]['parsedVOCs'])}")
print(f"Files: {len(projects[0]['files'])}")

# First wake up the server
print("Waking up server...")
try:
    resp = urllib.request.urlopen('https://yongyan.onrender.com/api/projects', timeout=90)
    print(f"Server awake! Current data: {resp.read()[:80]}")
except Exception as e:
    print(f"Wake attempt: {e}")

# Now push data
print("Pushing data...")
data = json.dumps({'projects': projects}).encode('utf-8')
req = urllib.request.Request(
    'https://yongyan.onrender.com/api/projects/sync',
    data=data,
    headers={'Content-Type': 'application/json'},
    method='POST'
)
resp = urllib.request.urlopen(req, timeout=60)
print(f"Status: {resp.status}")
print(resp.read().decode('utf-8'))

# Verify
print("Verifying...")
resp = urllib.request.urlopen('https://yongyan.onrender.com/api/projects', timeout=30)
result = json.loads(resp.read())
print(f"Projects on server: {len(result)}")
for p in result:
    print(f"  - {p['name']}: {len(p['parsedVOCs'])} VOCs")
