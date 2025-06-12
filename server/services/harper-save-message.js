let axios = require('axios');

function harperSaveMessage(message, username, room) {
  const dbUrl = process.env.HARPERDB_URL;
  const dbPw = process.env.HARPERDB_PW;
  if (!dbUrl || !dbPw) {
    console.error('Missing HarperDB credentials');
    return Promise.resolve(null);
  }

  let data = JSON.stringify({
    operation: 'insert',
    schema: 'realtime_chat_app',
    table: 'messages',
    records: [
      {
        message,
        username,
        room,
        __createdtime__: Date.now(),
      },
    ],
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
        if (response.data) {
          resolve(JSON.stringify(response.data));
        } else {
          resolve(null);
        }
      })
      .catch(function (error) {
        console.error('Error saving message:', error);
        reject(error);
      });
  });
}

module.exports = harperSaveMessage;
