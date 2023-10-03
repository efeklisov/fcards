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
      var stmt = db.prepare('INSERT OR IGNORE INTO Words VALUES (?, ?)');
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

const init = async () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('CREATE TABLE IF NOT EXISTS Words (word TEXT PRIMARY KEY, translation TEXT)');

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
module.exports.init = init;
