const { redisClient } = require("./redis");

const releaseLock = async (lockKey, lockToken) => {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  return redisClient.eval(script, {
    keys: [lockKey],
    arguments: [lockToken],
  });
};

module.exports = {
  releaseLock,
};
