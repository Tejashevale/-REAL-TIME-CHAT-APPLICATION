let axios = require('axios');

function harperGetMessages(room) {
  const dbUrl = process.env.HARPERDB_URL;
  const dbPw = process.env.HARPERDB_PW;
  if (!dbUrl || !dbPw) {
    console.error('Missing HarperDB credentials');
    return Promise.resolve(null);
  }

  let data = JSON.stringify({
    operation: 'sql',
    sql: `SELECT * FROM realtime_chat_app.messages WHERE room = '${room}' ORDER BY __createdtime__ DESC LIMIT 100`,
  });

  let config = {
    method: 'post',
    url: dbUrl,
    headers: {
      'Content-Type': 'application/json',
      Authorization: dbPw,
    },
    data: data,
  };

  return new Promise((resolve, reject) => {
    axios(config)
      .then(function (response) {
        if (response.data && response.data.records) {
          resolve(JSON.stringify(response.data.records));
        } else {
          resolve(null);
        }
      })
      .catch(function (error) {
        console.error('Error getting messages:', error);
        reject(error);
      });
  });
}

module.exports = harperGetMessages;
