#!/bin/bash
P=3066
echo "=== Step 1: Archive demo petitions ==="
curl -s -X PUT http://localhost:$P/api/petitions/1/complete -H "Content-Type: application/json" -d '{"operator":"op","result_text":"done","satisfaction":4}' > /dev/null
curl -s -X PUT http://localhost:$P/api/petitions/1/archive -H "Content-Type: application/json" -d '{"operator":"u","is_satisfied":true}' > /dev/null
curl -s -X PUT http://localhost:$P/api/petitions/2/complete -H "Content-Type: application/json" -d '{"operator":"op","result_text":"done","satisfaction":3}' > /dev/null
curl -s -X PUT http://localhost:$P/api/petitions/2/archive -H "Content-Type: application/json" -d '{"operator":"u","is_satisfied":true}' > /dev/null
echo "done"

echo "=== Step 2: Create and archive more petitions ==="
IDS=""
for i in 1 2 3 4; do
  RES=$(curl -s -X POST http://localhost:$P/api/petitions -H "Content-Type: application/json" -d "{\"source_channel\":\"rl\",\"petitioner_name\":\"UserA$i\",\"content\":\"噪音扰民问题$i\",\"expected_days\":5}")
  ID=$(echo $RES | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  IDS="$IDS $ID"
  echo "  Created petition $ID"
done
for i in 1 2 3; do
  RES=$(curl -s -X POST http://localhost:$P/api/petitions -H "Content-Type: application/json" -d "{\"source_channel\":\"ws\",\"petitioner_name\":\"UserB$i\",\"content\":\"低保补贴问题$i\",\"expected_days\":7}")
  ID=$(echo $RES | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  IDS="$IDS $ID"
  echo "  Created petition $ID"
done
echo "done: $IDS"

echo "=== Step 3: Archive new petitions ==="
for id in $IDS; do
  curl -s -X PUT http://localhost:$P/api/petitions/$id/process -H "Content-Type: application/json" -d '{"operator":"op"}' > /dev/null
  curl -s -X PUT http://localhost:$P/api/petitions/$id/complete -H "Content-Type: application/json" -d '{"operator":"op","result_text":"d","satisfaction":3}' > /dev/null
  curl -s -X PUT http://localhost:$P/api/petitions/$id/archive -H "Content-Type: application/json" -d '{"operator":"u","is_satisfied":true}' > /dev/null
  echo "  Archived $id"
done
echo "done"

echo "=== Step 4: Verify all archived ==="
curl -s "http://localhost:$P/api/petitions?page_size=20" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for p in d['data']:
    print(f\"  id={p['id']} status={p['status']} dept={p.get('primary_dept_name','None')}\")
"
