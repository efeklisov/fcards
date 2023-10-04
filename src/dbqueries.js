const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database("words.db");

const getTranslation = async (word) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Words WHERE word = ?', [word], (err, row) => {
      if (err) {
        
        reject(err);
      } else {
        if (!row) {
          resolve({word:'',});
          return;
        }
        resolve(JSON.parse(row.translation));
      }
    });
  });
};

const getNTranslation = async (n) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Words WHERE rowid = ?', [n], (err, row) => {
      if (err) {
        reject(err);
      } else {
        if (!row) {
          resolve({word:'',});
          return;
        }
        resolve(JSON.parse(row.translation));
      }
    });
  });
};

const insertAndGetCount = async (word, translation) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      var stmt = db.prepare('INSERT OR IGNORE INTO Words VALUES (?, ?, 0, 0)');
      stmt.run(word, JSON.stringify(translation, undefined, 2));
      stmt.finalize();

      db.get('SELECT COUNT(*) as total FROM Words', [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          if (!row) {
            resolve(0);
            return;
          }
          resolve(row.total);
        }
      });
    });
  });
};

const getRows = async (n, m) => {
  return new Promise((resolve, reject) => {
    let allRows = [];
    db.serialize(() => {
      const sql = 'SELECT rowid AS id, word, translation FROM Words LIMIT ? OFFSET ?';
      db.each(sql, [n, m],  function(err, row) {
        if (err) reject(err);
        allRows.push(row.translation);
      }, function() {
        resolve(allRows);
      });
    });
  });
};

const getResults = async (n, g) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.get('SELECT rowid as id, * FROM Words WHERE rowid = ?', [n], (err, row) => {
        if (err) {
          reject(err);
        } else {
          let ret = {guesses: -1, misses: -1};
          if (!row) {
            resolve(ret);
            return;
          }
          ret = {guesses: row.guesses + (g ? 1 : 0), misses: row.misses + (g ? 0 : 1)};
          resolve(ret);
          
          db.run('UPDATE Words SET guesses = ?, misses = ? WHERE rowid = ?', 
            ret.guesses, ret.misses, row.id);
        }
      });
    })
  });
};

const getAllMisses = async () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.get('SELECT SUM(misses) as total FROM Words', [], (err, row) => {
        if (err)
          reject(err);
        else
          resolve(row.total);
      });
    })
  });
};

const getRandomWord = async (n) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const sql = `SELECT t1.misses, t1.translation, 
        (SELECT SUM(t2.misses) FROM Words AS t2 WHERE t2.rowid <= t1.rowid) as cumsum
        FROM Words AS t1 ORDER BY t1.rowid`;

      db.all(sql, [], (err, rows) => {
	if (err) {
	  reject(err)
	  return;
	}
	
	let ret = {translation: rows[0].translation, index: 1};

	for (let i = 1; i < rows.length; i++)
	  if (n >= i + rows[i - 1].cumsum && n <= i + rows[i].cumsum) {
	    ret = {translation: rows[i].translation, index: i + 1};
	    break;
	  }
	
	resolve(ret);
      });
    })
  });
};


const init = async () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS Words (
        word TEXT PRIMARY KEY,
	translation TEXT,
	guesses INTEGER,
	misses INTEGER
      )`);

      db.get('SELECT COUNT(*) as total FROM Words', [], (err, row) => {
        if (err) {
          console.error(err.message);
          reject(err);
        }
        resolve(row.total);
      });
    });
  });
}

module.exports.getTranslation = getTranslation;
module.exports.getNTranslation = getNTranslation;
module.exports.insertAndGetCount = insertAndGetCount;
module.exports.getRows = getRows;
module.exports.getResults = getResults;
module.exports.getAllMisses = getAllMisses;
module.exports.getRandomWord = getRandomWord;
module.exports.init = init;
