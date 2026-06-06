const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const dbDir = process.env.DB_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'petition.db');
const db = new sqlite3.Database(dbPath);

const STATUS_PENDING_ASSIGN = '待分拨';
const STATUS_ASSIGNED = '已分拨';
const STATUS_PROCESSING = '办理中';
const STATUS_COMPLETED = '已办结';
const STATUS_ARCHIVED = '已归档';

const WARNING_YELLOW = 'yellow';
const WARNING_RED = 'red';

const DEFAULT_DEPARTMENTS = [
  { id: 1, name: '城管局', code: 'CGJ' },
  { id: 2, name: '民政局', code: 'MZJ' },
  { id: 3, name: '教育局', code: 'JYJ' },
  { id: 4, name: '人社局', code: 'RSJ' },
  { id: 5, name: '住建局', code: 'ZJJ' }
];

const DEFAULT_RULES = [
  { keywords: '噪音,施工扰民,占道经营,违章建筑', dept_id: 1, priority: 10 },
  { keywords: '低保,补贴,救助,养老,婚姻', dept_id: 2, priority: 9 },
  { keywords: '教育,学校,学费,教师,补课', dept_id: 3, priority: 8 },
  { keywords: '社保,就业,工资,医保,失业', dept_id: 4, priority: 7 },
  { keywords: '房产,物业,拆迁,供暖,公积金', dept_id: 5, priority: 6 }
];

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDatabase() {
  await runSql(`CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE
  )`);

  await runSql(`CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keywords TEXT NOT NULL,
    dept_id INTEGER NOT NULL,
    priority INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dept_id) REFERENCES departments(id)
  )`);

  await runSql(`CREATE TABLE IF NOT EXISTS petitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_channel TEXT NOT NULL,
    petitioner_name TEXT NOT NULL,
    petitioner_contact TEXT,
    content TEXT NOT NULL,
    expected_days INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT '待分拨',
    primary_dept_id INTEGER,
    co_dept1_id INTEGER,
    co_dept2_id INTEGER,
    assigned_at DATETIME,
    completed_at DATETIME,
    archived_at DATETIME,
    result_text TEXT,
    satisfaction INTEGER,
    is_escalated INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT DEFAULT 'system',
    FOREIGN KEY (primary_dept_id) REFERENCES departments(id),
    FOREIGN KEY (co_dept1_id) REFERENCES departments(id),
    FOREIGN KEY (co_dept2_id) REFERENCES departments(id)
  )`);

  await runSql(`CREATE TABLE IF NOT EXISTS flow_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    petition_id INTEGER NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    operator TEXT NOT NULL,
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (petition_id) REFERENCES petitions(id)
  )`);

  await runSql(`CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    petition_id INTEGER NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    is_escalation INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (petition_id) REFERENCES petitions(id)
  )`);

  const deptCount = await getSql("SELECT COUNT(*) as count FROM departments");
  if (deptCount.count === 0) {
    const stmt = db.prepare("INSERT INTO departments (id, name, code) VALUES (?, ?, ?)");
    for (const dept of DEFAULT_DEPARTMENTS) {
      await new Promise((resolve, reject) => {
        stmt.run(dept.id, dept.name, dept.code, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    await new Promise((resolve, reject) => {
      stmt.finalize((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('已初始化5个职能部门');
  }

  const ruleCount = await getSql("SELECT COUNT(*) as count FROM rules");
  if (ruleCount.count === 0) {
    const stmt = db.prepare("INSERT INTO rules (keywords, dept_id, priority) VALUES (?, ?, ?)");
    for (const rule of DEFAULT_RULES) {
      await new Promise((resolve, reject) => {
        stmt.run(rule.keywords, rule.dept_id, rule.priority, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    await new Promise((resolve, reject) => {
      stmt.finalize((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('已初始化默认分拨规则');
  }

  const petitionCount = await getSql("SELECT COUNT(*) as count FROM petitions");
  if (petitionCount.count === 0) {
    await initDemoPetitions();
  }
}

async function initDemoPetitions() {
  const demoPetitions = [
    {
      source_channel: '热线',
      petitioner_name: '张三',
      petitioner_contact: '13800138001',
      content: '小区旁边工地夜间施工扰民，噪音太大无法休息，请尽快处理',
      expected_days: 5,
      created_by: 'demo',
      auto_process: true,
      operator: '城管局操作员',
      remark: '已签收，开始处理'
    },
    {
      source_channel: '网站',
      petitioner_name: '李四',
      petitioner_contact: '13800138002',
      content: '想申请低保，请问需要什么条件和材料，如何办理',
      expected_days: 7,
      created_by: 'demo',
      auto_process: true,
      operator: '民政局操作员',
      remark: '已签收'
    },
    {
      source_channel: '信箱',
      petitioner_name: '王五',
      petitioner_contact: '13800138003',
      content: '建议增加小区周边公交线路，方便居民出行',
      expected_days: 10,
      created_by: 'demo',
      auto_process: false
    }
  ];

  for (const petition of demoPetitions) {
    const result = await matchDepartment(petition.content);
    
    const insertResult = await runSql(`INSERT INTO petitions 
      (source_channel, petitioner_name, petitioner_contact, content, expected_days, 
       status, primary_dept_id, co_dept1_id, co_dept2_id, assigned_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        petition.source_channel,
        petition.petitioner_name,
        petition.petitioner_contact,
        petition.content,
        petition.expected_days,
        result.deptId ? STATUS_ASSIGNED : STATUS_PENDING_ASSIGN,
        result.deptId,
        null,
        null,
        result.deptId ? new Date().toISOString() : null,
        petition.created_by
      ]
    );
    
    const petitionId = insertResult.lastID;

    const flowStatus = result.deptId ? STATUS_ASSIGNED : STATUS_PENDING_ASSIGN;
    const remark = result.deptId 
      ? `自动分拨至${result.deptName}，匹配关键词: ${result.matchedKeyword}`
      : '未匹配到分拨规则，待人工分拨';
    
    await addFlowLog(petitionId, null, flowStatus, 'system', remark);

    if (petition.auto_process && result.deptId) {
      await updatePetitionStatus(petitionId, STATUS_ASSIGNED, STATUS_PROCESSING, petition.operator, petition.remark);
    }
  }
  
  console.log('已初始化3条演示信访件');
}

async function matchDepartment(content) {
  const rules = await allSql(`SELECT r.*, d.name as dept_name FROM rules r 
            JOIN departments d ON r.dept_id = d.id 
            ORDER BY r.priority DESC`);
  
  let bestMatch = null;
  let highestPriority = -1;
  let matchedKeyword = null;

  for (const rule of rules) {
    const keywords = rule.keywords.split(',');
    for (const kw of keywords) {
      if (content.includes(kw.trim())) {
        if (rule.priority > highestPriority) {
          highestPriority = rule.priority;
          bestMatch = rule;
          matchedKeyword = kw.trim();
          break;
        }
      }
    }
  }

  if (bestMatch) {
    return { deptId: bestMatch.dept_id, deptName: bestMatch.dept_name, matchedKeyword };
  } else {
    return { deptId: null, deptName: null, matchedKeyword: null };
  }
}

function addFlowLog(petitionId, fromStatus, toStatus, operator, remark) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO flow_logs (petition_id, from_status, to_status, operator, remark)
            VALUES (?, ?, ?, ?, ?)`,
      [petitionId, fromStatus, toStatus, operator, remark],
      function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function updatePetitionStatus(petitionId, fromStatus, toStatus, operator, remark) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE petitions SET status = ? WHERE id = ?`, [toStatus, petitionId], (err) => {
      if (err) return reject(err);
      addFlowLog(petitionId, fromStatus, toStatus, operator, remark).then(resolve).catch(reject);
    });
  });
}

function checkOverdueAndWarnings() {
  return new Promise((resolve, reject) => {
    const now = new Date();
    db.all(`SELECT p.*, d.name as dept_name FROM petitions p
            LEFT JOIN departments d ON p.primary_dept_id = d.id
            WHERE p.status IN ('已分拨', '办理中') AND p.assigned_at IS NOT NULL`,
      (err, petitions) => {
        if (err) return reject(err);
        let pending = petitions.length;
        if (pending === 0) return resolve();

        petitions.forEach(petition => {
          const assignedAt = new Date(petition.assigned_at);
          const deadline = new Date(assignedAt.getTime() + petition.expected_days * 24 * 60 * 60 * 1000);
          const totalMs = petition.expected_days * 24 * 60 * 60 * 1000;
          const remainingMs = deadline - now;
          const remainingRatio = remainingMs / totalMs;
          const overdueDays = Math.floor((now - deadline) / (24 * 60 * 60 * 1000));

          if (remainingRatio > 0 && remainingRatio < 0.25) {
            checkAndCreateWarning(petition.id, WARNING_YELLOW, 
              `距离办理时限仅剩不足25%，请加快处理进度，截止日期: ${deadline.toLocaleString()}`)
              .then(() => { pending--; if (pending === 0) resolve(); });
          } else if (remainingMs <= 0) {
            checkAndCreateWarning(petition.id, WARNING_RED, 
              `已超期${overdueDays}天未办结，请立即处理`)
              .then(() => {
                if (overdueDays >= 3 && !petition.is_escalated) {
                  escalatePetition(petition.id, overdueDays).then(() => {
                    pending--;
                    if (pending === 0) resolve();
                  });
                } else {
                  pending--;
                  if (pending === 0) resolve();
                }
              });
          } else {
            pending--;
            if (pending === 0) resolve();
          }
        });
      }
    );
  });
}

function checkAndCreateWarning(petitionId, level, message) {
  return new Promise((resolve, reject) => {
    const today = new Date().toDateString();
    db.get(`SELECT * FROM warnings WHERE petition_id = ? AND level = ? 
            AND DATE(created_at) = DATE('now') ORDER BY created_at DESC LIMIT 1`,
      [petitionId, level],
      (err, existing) => {
        if (err) return reject(err);
        if (!existing) {
          db.run(`INSERT INTO warnings (petition_id, level, message) VALUES (?, ?, ?)`,
            [petitionId, level, message],
            function(err) {
              if (err) return reject(err);
              console.log(`[预警] 信访件#${petitionId} ${level === 'yellow' ? '黄色预警' : '红色预警'}: ${message}`);
              resolve(this.lastID);
            }
          );
        } else {
          resolve();
        }
      }
    );
  });
}

function escalatePetition(petitionId, overdueDays) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`UPDATE petitions SET is_escalated = 1 WHERE id = ?`, [petitionId], (err) => {
        if (err) return reject(err);
        addFlowLog(petitionId, null, null, 'system', 
          `系统自动督办升级: 已超期${overdueDays}天，升级为重点督办件`).then(() => {
            db.run(`INSERT INTO warnings (petition_id, level, message, is_escalation) 
                    VALUES (?, ?, ?, 1)`,
              [petitionId, WARNING_RED, `系统自动升级: 超期${overdueDays}天，列为重点督办件`],
              function(err) {
                if (err) return reject(err);
                console.log(`[升级] 信访件#${petitionId} 已自动升级为督办件，超期${overdueDays}天`);
                resolve();
              }
            );
          });
      });
    });
  });
}

function getPetitionWithDetails(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT p.*, 
            d1.name as primary_dept_name,
            d2.name as co_dept1_name,
            d3.name as co_dept2_name
            FROM petitions p
            LEFT JOIN departments d1 ON p.primary_dept_id = d1.id
            LEFT JOIN departments d2 ON p.co_dept1_id = d2.id
            LEFT JOIN departments d3 ON p.co_dept2_id = d3.id
            WHERE p.id = ?`, [id], (err, petition) => {
      if (err) return reject(err);
      if (!petition) return resolve(null);
      
      db.all(`SELECT * FROM flow_logs WHERE petition_id = ? ORDER BY created_at ASC`, 
        [id], (err, logs) => {
          if (err) return reject(err);
          petition.flow_logs = logs;
          
          db.all(`SELECT * FROM warnings WHERE petition_id = ? ORDER BY created_at ASC`,
            [id], (err, warnings) => {
              if (err) return reject(err);
              petition.warnings = warnings;
              
              if (petition.assigned_at) {
                const assignedAt = new Date(petition.assigned_at);
                const now = new Date();
                const deadline = new Date(assignedAt.getTime() + petition.expected_days * 24 * 60 * 60 * 1000);
                petition.deadline = deadline.toISOString();
                petition.remaining_days = Math.ceil((deadline - now) / (24 * 60 * 60 * 1000));
                petition.overdue_days = Math.max(0, Math.floor((now - deadline) / (24 * 60 * 60 * 1000)));
              }
              
              resolve(petition);
            });
        });
    });
  });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '政务信访件智能分拨与督办跟踪服务运行正常' });
});

app.get('/api/departments', (req, res) => {
  db.all(`SELECT * FROM departments ORDER BY id`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

app.get('/api/rules', (req, res) => {
  db.all(`SELECT r.*, d.name as dept_name FROM rules r 
          JOIN departments d ON r.dept_id = d.id 
          ORDER BY r.priority DESC, r.id ASC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

app.post('/api/rules', (req, res) => {
  const { keywords, dept_id, priority } = req.body;
  if (!keywords || !dept_id) {
    return res.status(400).json({ error: 'keywords和dept_id为必填项' });
  }
  db.run(`INSERT INTO rules (keywords, dept_id, priority) VALUES (?, ?, ?)`,
    [keywords, dept_id, priority || 0],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: '规则创建成功' });
    }
  );
});

app.put('/api/rules/:id', (req, res) => {
  const { keywords, dept_id, priority } = req.body;
  const id = req.params.id;
  db.run(`UPDATE rules SET keywords = COALESCE(?, keywords), 
          dept_id = COALESCE(?, dept_id), 
          priority = COALESCE(?, priority) 
          WHERE id = ?`,
    [keywords, dept_id, priority, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: '规则不存在' });
      res.json({ message: '规则更新成功' });
    }
  );
});

app.delete('/api/rules/:id', (req, res) => {
  const id = req.params.id;
  db.run(`DELETE FROM rules WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '规则不存在' });
    res.json({ message: '规则删除成功' });
  });
});

app.post('/api/petitions', async (req, res) => {
  const { source_channel, petitioner_name, petitioner_contact, content, expected_days, created_by } = req.body;
  
  if (!source_channel || !petitioner_name || !content || !expected_days) {
    return res.status(400).json({ error: 'source_channel, petitioner_name, content, expected_days为必填项' });
  }

  try {
    const result = await matchDepartment(content);
    
    db.run(`INSERT INTO petitions 
      (source_channel, petitioner_name, petitioner_contact, content, expected_days, 
       status, primary_dept_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        source_channel,
        petitioner_name,
        petitioner_contact || null,
        content,
        expected_days,
        result.deptId ? STATUS_ASSIGNED : STATUS_PENDING_ASSIGN,
        result.deptId,
        created_by || 'system'
      ],
      async function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const petitionId = this.lastID;

        const flowStatus = result.deptId ? STATUS_ASSIGNED : STATUS_PENDING_ASSIGN;
        const remark = result.deptId 
          ? `自动分拨至${result.deptName}，匹配关键词: ${result.matchedKeyword}`
          : '未匹配到分拨规则，待人工分拨';
        
        await addFlowLog(petitionId, null, flowStatus, 'system', remark);

        if (result.deptId) {
          db.run(`UPDATE petitions SET assigned_at = ? WHERE id = ?`,
            [new Date().toISOString(), petitionId]);
        }

        const petition = await getPetitionWithDetails(petitionId);
        res.json({ 
          id: petitionId, 
          message: '信访件录入成功',
          auto_assigned: !!result.deptId,
          dept_name: result.deptName,
          data: petition
        });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/petitions/:id/assign', async (req, res) => {
  const { primary_dept_id, co_dept1_id, co_dept2_id, operator } = req.body;
  const id = req.params.id;

  if (!primary_dept_id || !operator) {
    return res.status(400).json({ error: 'primary_dept_id和operator为必填项' });
  }

  try {
    const petition = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM petitions WHERE id = ?`, [id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!petition) return res.status(404).json({ error: '信访件不存在' });
    
    const fromStatus = petition.status;
    const deptName = await new Promise((resolve, reject) => {
      db.get(`SELECT name FROM departments WHERE id = ?`, [primary_dept_id], (err, row) => {
        if (err) return reject(err);
        resolve(row ? row.name : null);
      });
    });

    db.run(`UPDATE petitions SET 
            primary_dept_id = ?, 
            co_dept1_id = ?, 
            co_dept2_id = ?,
            status = ?,
            assigned_at = ?
            WHERE id = ?`,
      [primary_dept_id, co_dept1_id || null, co_dept2_id || null, STATUS_ASSIGNED, new Date().toISOString(), id],
      async function(err) {
        if (err) return res.status(500).json({ error: err.message });
        let remark = `人工分拨，主办部门: ${deptName}`;
        if (co_dept1_id || co_dept2_id) {
          const coDepts = [];
          if (co_dept1_id) {
            const co1 = await new Promise(r => db.get(`SELECT name FROM departments WHERE id = ?`, [co_dept1_id], (e, row) => r(row ? row.name : null)));
            if (co1) coDepts.push(co1);
          }
          if (co_dept2_id) {
            const co2 = await new Promise(r => db.get(`SELECT name FROM departments WHERE id = ?`, [co_dept2_id], (e, row) => r(row ? row.name : null)));
            if (co2) coDepts.push(co2);
          }
          if (coDepts.length > 0) remark += `，协办: ${coDepts.join('、')}`;
        }
        await addFlowLog(id, fromStatus, STATUS_ASSIGNED, operator, remark);
        const updated = await getPetitionWithDetails(id);
        res.json({ message: '分拨成功', data: updated });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/petitions/:id/accept', async (req, res) => {
  const { operator, remark } = req.body;
  const id = req.params.id;

  if (!operator) return res.status(400).json({ error: 'operator为必填项' });

  try {
    const petition = await new Promise((r, reject) => db.get(`SELECT * FROM petitions WHERE id = ?`, [id], (e, row) => { if (e) reject(e); else r(row); }));
    if (!petition) return res.status(404).json({ error: '信访件不存在' });
    if (petition.status !== STATUS_ASSIGNED && petition.status !== STATUS_PENDING_ASSIGN) {
      return res.status(400).json({ error: '只有待分拨或已分拨状态的信访件可以签收' });
    }

    await updatePetitionStatus(id, petition.status, STATUS_ASSIGNED, operator, remark || '部门已签收');
    const updated = await getPetitionWithDetails(id);
    res.json({ message: '签收成功', data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/petitions/:id/process', async (req, res) => {
  const { operator, remark } = req.body;
  const id = req.params.id;

  if (!operator) return res.status(400).json({ error: 'operator为必填项' });

  try {
    const petition = await new Promise((r, reject) => db.get(`SELECT * FROM petitions WHERE id = ?`, [id], (e, row) => { if (e) reject(e); else r(row); }));
    if (!petition) return res.status(404).json({ error: '信访件不存在' });
    if (petition.status !== STATUS_ASSIGNED) {
      return res.status(400).json({ error: '只有已分拨状态的信访件可以开始办理' });
    }

    await updatePetitionStatus(id, STATUS_ASSIGNED, STATUS_PROCESSING, operator, remark || '开始办理');
    const updated = await getPetitionWithDetails(id);
    res.json({ message: '已标记为办理中', data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/petitions/:id/complete', async (req, res) => {
  const { operator, result_text, satisfaction } = req.body;
  const id = req.params.id;

  if (!operator || !result_text) {
    return res.status(400).json({ error: 'operator和result_text为必填项' });
  }

  try {
    const petition = await new Promise((r, reject) => db.get(`SELECT * FROM petitions WHERE id = ?`, [id], (e, row) => { if (e) reject(e); else r(row); }));
    if (!petition) return res.status(404).json({ error: '信访件不存在' });
    if (petition.status !== STATUS_PROCESSING) {
      return res.status(400).json({ error: '只有办理中状态的信访件可以提交办结' });
    }

    db.run(`UPDATE petitions SET status = ?, result_text = ?, satisfaction = ?, completed_at = ? WHERE id = ?`,
      [STATUS_COMPLETED, result_text, satisfaction || null, new Date().toISOString(), id],
      async function(err) {
        if (err) return res.status(500).json({ error: err.message });
        await addFlowLog(id, STATUS_PROCESSING, STATUS_COMPLETED, operator, 
          `提交办结报告，满意度自评: ${satisfaction || '未填写'}\n办理结果: ${result_text}`);
        const updated = await getPetitionWithDetails(id);
        res.json({ message: '办结报告提交成功，待录入人确认归档', data: updated });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/petitions/:id/archive', async (req, res) => {
  const { operator, is_satisfied, reject_reason } = req.body;
  const id = req.params.id;

  if (!operator || is_satisfied === undefined) {
    return res.status(400).json({ error: 'operator和is_satisfied为必填项' });
  }

  try {
    const petition = await new Promise((r, reject) => db.get(`SELECT * FROM petitions WHERE id = ?`, [id], (e, row) => { if (e) reject(e); else r(row); }));
    if (!petition) return res.status(404).json({ error: '信访件不存在' });
    if (petition.status !== STATUS_COMPLETED) {
      return res.status(400).json({ error: '只有已办结状态的信访件可以确认归档' });
    }

    if (is_satisfied) {
      db.run(`UPDATE petitions SET status = ?, archived_at = ? WHERE id = ?`,
        [STATUS_ARCHIVED, new Date().toISOString(), id],
        async function(err) {
          if (err) return res.status(500).json({ error: err.message });
          await addFlowLog(id, STATUS_COMPLETED, STATUS_ARCHIVED, operator, '满意，已归档');
          const updated = await getPetitionWithDetails(id);
          res.json({ message: '已满意归档', data: updated });
        }
      );
    } else {
      if (!reject_reason) return res.status(400).json({ error: '不满意退回必须填写退回原因' });
      db.run(`UPDATE petitions SET status = ? WHERE id = ?`,
        [STATUS_ASSIGNED, id],
        async function(err) {
          if (err) return res.status(500).json({ error: err.message });
          await addFlowLog(id, STATUS_COMPLETED, STATUS_ASSIGNED, operator, `不满意退回，原因: ${reject_reason}`);
          const updated = await getPetitionWithDetails(id);
          res.json({ message: '已退回重新办理', data: updated });
        }
      );
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/petitions/:id/remind', async (req, res) => {
  const { operator, remark } = req.body;
  const id = req.params.id;

  if (!operator) return res.status(400).json({ error: 'operator为必填项' });

  try {
    const petition = await new Promise((r, reject) => db.get(`SELECT * FROM petitions WHERE id = ?`, [id], (e, row) => { if (e) reject(e); else r(row); }));
    if (!petition) return res.status(404).json({ error: '信访件不存在' });
    if (petition.status === STATUS_ARCHIVED) {
      return res.status(400).json({ error: '已归档的信访件不能发起催办' });
    }

    await addFlowLog(id, petition.status, petition.status, operator, `手动催办${remark ? ': ' + remark : ''}`);
    const updated = await getPetitionWithDetails(id);
    res.json({ message: '催办成功', data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/petitions/supervise', async (req, res) => {
  try {
    await checkOverdueAndWarnings();
    
    const { warning_level, dept_id, sort_by } = req.query;
    
    let sql = `SELECT p.*, 
               d1.name as primary_dept_name,
               d2.name as co_dept1_name,
               d3.name as co_dept2_name,
               CASE WHEN p.assigned_at IS NOT NULL 
                    THEN julianday('now') - julianday(p.assigned_at) - p.expected_days 
                    ELSE 0 END as overdue_days_calc
               FROM petitions p
               LEFT JOIN departments d1 ON p.primary_dept_id = d1.id
               LEFT JOIN departments d2 ON p.co_dept1_id = d2.id
               LEFT JOIN departments d3 ON p.co_dept2_id = d3.id
               LEFT JOIN warnings w ON p.id = w.petition_id
               WHERE p.status IN ('已分拨', '办理中', '已办结')`;
    
    const params = [];
    
    if (warning_level) {
      sql += ` AND w.level = ?`;
      params.push(warning_level);
    }
    
    if (dept_id) {
      sql += ` AND p.primary_dept_id = ?`;
      params.push(dept_id);
    }
    
    sql += ` GROUP BY p.id ORDER BY p.is_escalated DESC, `;
    
    if (sort_by === 'overdue') {
      sql += ` overdue_days_calc DESC, `;
    }
    
    sql += ` p.created_at DESC`;
    
    db.all(sql, params, async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const results = [];
      for (const petition of rows) {
        const full = await getPetitionWithDetails(petition.id);
        if (full) {
          if (!warning_level || full.warnings.some(w => w.level === warning_level)) {
            results.push(full);
          }
        }
      }
      
      if (sort_by === 'overdue') {
        results.sort((a, b) => (b.overdue_days || 0) - (a.overdue_days || 0));
      }
      
      res.json({ 
        count: results.length, 
        escalated_count: results.filter(r => r.is_escalated).length,
        data: results 
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/petitions/:id', async (req, res) => {
  try {
    const petition = await getPetitionWithDetails(req.params.id);
    if (!petition) return res.status(404).json({ error: '信访件不存在' });
    res.json({ data: petition });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/petitions', (req, res) => {
  const { status, dept_id, page = 1, page_size = 20 } = req.query;
  
  let sql = `SELECT p.*, 
             d1.name as primary_dept_name,
             d2.name as co_dept1_name,
             d3.name as co_dept2_name
             FROM petitions p
             LEFT JOIN departments d1 ON p.primary_dept_id = d1.id
             LEFT JOIN departments d2 ON p.co_dept1_id = d2.id
             LEFT JOIN departments d3 ON p.co_dept2_id = d3.id WHERE 1=1`;
  const params = [];
  
  if (status) {
    sql += ` AND p.status = ?`;
    params.push(status);
  }
  if (dept_id) {
    sql += ` AND p.primary_dept_id = ?`;
    params.push(dept_id);
  }
  
  sql += ` ORDER BY p.is_escalated DESC, p.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(page_size), (parseInt(page) - 1) * parseInt(page_size));
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    let countSql = `SELECT COUNT(*) as total FROM petitions p WHERE 1=1`;
    const countParams = [];
    if (status) { countSql += ` AND p.status = ?`; countParams.push(status); }
    if (dept_id) { countSql += ` AND p.primary_dept_id = ?`; countParams.push(dept_id); }
    
    db.get(countSql, countParams, (err, countRow) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ 
        total: countRow.total,
        page: parseInt(page),
        page_size: parseInt(page_size),
        data: rows 
      });
    });
  });
});

app.get('/api/petitions/:id/logs', (req, res) => {
  db.all(`SELECT * FROM flow_logs WHERE petition_id = ? ORDER BY created_at ASC`, 
    [req.params.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ data: rows });
    });
});

app.get('/api/warnings', (req, res) => {
  const { level, petition_id } = req.query;
  let sql = `SELECT w.*, p.petitioner_name, p.content 
             FROM warnings w
             JOIN petitions p ON w.petition_id = p.id WHERE 1=1`;
  const params = [];
  if (level) { sql += ` AND w.level = ?`; params.push(level); }
  if (petition_id) { sql += ` AND w.petition_id = ?`; params.push(petition_id); }
  sql += ` ORDER BY w.created_at DESC`;
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ count: rows.length, data: rows });
  });
});

initDatabase().then(() => {
  checkOverdueAndWarnings().catch(console.error);
  
  setInterval(() => {
    checkOverdueAndWarnings().catch(console.error);
  }, 60 * 1000);

  app.listen(PORT, () => {
    console.log('========================================');
    console.log('政务信访件智能分拨与督办跟踪服务');
    console.log('服务端口:', PORT);
    console.log('数据库路径:', dbPath);
    console.log('========================================');
    console.log('API接口列表:');
    console.log('  GET  /api/health                 - 健康检查');
    console.log('  GET  /api/departments            - 获取部门列表');
    console.log('  GET  /api/rules                  - 获取分拨规则');
    console.log('  POST /api/rules                  - 新增分拨规则');
    console.log('  PUT  /api/rules/:id              - 更新分拨规则');
    console.log('  DELETE /api/rules/:id            - 删除分拨规则');
    console.log('  POST /api/petitions              - 录入信访件（自动分拨）');
    console.log('  GET  /api/petitions              - 查询信访件列表');
    console.log('  GET  /api/petitions/:id          - 查询信访件详情');
    console.log('  PUT  /api/petitions/:id/assign   - 人工分拨信访件');
    console.log('  PUT  /api/petitions/:id/accept   - 部门签收');
    console.log('  PUT  /api/petitions/:id/process  - 开始办理');
    console.log('  PUT  /api/petitions/:id/complete - 提交办结报告');
    console.log('  PUT  /api/petitions/:id/archive  - 确认归档（满意/退回）');
    console.log('  PUT  /api/petitions/:id/remind   - 手动催办');
    console.log('  GET  /api/petitions/supervise    - 督办查询（预警/部门/超期）');
    console.log('  GET  /api/petitions/:id/logs     - 查询流转日志');
    console.log('  GET  /api/warnings               - 查询预警记录');
    console.log('========================================');
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
