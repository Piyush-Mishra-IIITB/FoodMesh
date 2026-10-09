import http from "k6/http";

export const options = {
  vus: 5,
  iterations: 25,
};

export default function () {
  const response = http.get("http://localhost:5000/health");

  console.log(
    JSON.stringify({
      status: response.status,
      body: response.body,
      limit: response.headers["RateLimit-Limit"],
      remaining: response.headers["RateLimit-Remaining"],
      requestId: response.headers["X-Request-ID"],
    }),
  );
}
