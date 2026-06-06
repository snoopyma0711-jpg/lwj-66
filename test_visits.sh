#!/bin/bash
P=3066
echo "=== Visit petitions ==="
# 城管局(1,4,5,6,7): score 5,4,5,4,2 -> avg=4, good_rate=80%, bad_count=1, bad_rate=20%(边界)
curl -s -X POST http://localhost:$P/api/visits -H "Content-Type: application/json" -d '{"petition_id":1,"visitor":"V1","visit_time":"2026-06-06T10:00:00Z","score":5,"feedback":"hao"}'
echo ""
curl -s -X POST http://localhost:$P/api/visits -H "Content-Type: application/json" -d '{"petition_id":4,"visitor":"V1","visit_time":"2026-06-06T10:01:00Z","score":4,"feedback":"ok"}'
echo ""
curl -s -X POST http://localhost:$P/api/visits -H "Content-Type: application/json" -d '{"petition_id":5,"visitor":"V1","visit_time":"2026-06-06T10:02:00Z","score":5,"feedback":"hao"}'
echo ""
curl -s -X POST http://localhost:$P/api/visits -H "Content-Type: application/json" -d '{"petition_id":6,"visitor":"V1","visit_time":"2026-06-06T10:03:00Z","score":4,"feedback":"ok"}'
echo ""
curl -s -X POST http://localhost:$P/api/visits -H "Content-Type: application/json" -d '{"petition_id":7,"visitor":"V1","visit_time":"2026-06-06T10:04:00Z","score":2,"feedback":"bad"}'
echo ""
# 民政局(2,8,9,10): score 4,1,2,1 -> avg=2, good_rate=25%, bad_count=3, bad_rate=75%
curl -s -X POST http://localhost:$P/api/visits -H "Content-Type: application/json" -d '{"petition_id":2,"visitor":"V2","visit_time":"2026-06-06T10:05:00Z","score":4,"feedback":"ok"}'
echo ""
curl -s -X POST http://localhost:$P/api/visits -H "Content-Type: application/json" -d '{"petition_id":8,"visitor":"V2","visit_time":"2026-06-06T10:06:00Z","score":1,"feedback":"bad"}'
echo ""
curl -s -X POST http://localhost:$P/api/visits -H "Content-Type: application/json" -d '{"petition_id":9,"visitor":"V2","visit_time":"2026-06-06T10:07:00Z","score":2,"feedback":"bad"}'
echo ""
curl -s -X POST http://localhost:$P/api/visits -H "Content-Type: application/json" -d '{"petition_id":10,"visitor":"V2","visit_time":"2026-06-06T10:08:00Z","score":1,"feedback":"bad"}'
echo ""
echo "=== Done ==="
