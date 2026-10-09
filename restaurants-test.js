import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 1,
  duration: "60s",
};

export default function () {
  const response = http.get("http://localhost:5000/api/restaurants");

  check(response, {
    "status is 200": (r) => r.status === 200,
  });

  if (response.status !== 200) {
    console.log(`FAILED status=${response.status} body=${response.body}`);
  }

  sleep(1);
}
