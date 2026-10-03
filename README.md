
# Distributed Food Delivery Platform

A backend-only distributed food delivery system built with **Node.js,
Express, MongoDB, Redis, RabbitMQ, Docker, and Kubernetes**. The
application is organized as five independent microservices behind a
central API Gateway.

> **Project status:** Version 1.0 --- local Docker Compose and
> Minikube/Kubernetes deployment implemented. Cloud deployment is
> intentionally deferred.

## Table of Contents

-   [Overview](#overview)
-   [Architecture](#architecture)
-   [Technology Stack](#technology-stack)
-   [Services](#services)
-   [Order Lifecycle](#order-lifecycle)
-   [Distributed Systems Features](#distributed-systems-features)
-   [Authentication and
    Authorization](#authentication-and-authorization)
-   [API Reference](#api-reference)
-   [Prerequisites](#prerequisites)
-   [Run with Docker Compose](#run-with-docker-compose)
-   [Run on Kubernetes with Minikube](#run-on-kubernetes-with-minikube)
-   [Environment Configuration](#environment-configuration)
-   [Testing and Verification](#testing-and-verification)
-   [Repository Structure](#repository-structure)
-   [Known Limitations and Future
    Work](#known-limitations-and-future-work)

## Overview

The platform supports the main backend workflows of a food delivery
application:

-   Customer registration and login.
-   Restaurant and menu management.
-   Menu validation and order creation.
-   Order status transitions and cancellation.
-   Delivery partner registration, availability, location updates, and
    assignment.
-   Payment status handling and refunds through a simulated payment
    workflow.
-   Asynchronous communication between services using RabbitMQ.
-   Caching and coordination using Redis.
-   Containerized local deployment and Kubernetes orchestration.

The system is backend-only; it does not include a customer-facing web or
mobile frontend.

## Architecture


flowchart TB
    Client[Client / Postman] --> Gateway[API Gateway :5000]

    Gateway --> User[User Service :5001]
    Gateway --> Restaurant[Restaurant Service :5002]
    Gateway --> Order[Order Service :5003]
    Gateway --> Delivery[Delivery Service :5004]
    Gateway --> Payment[Payment Service :5005]

    User --> Mongo[(MongoDB)]
    Restaurant --> Mongo
    Order --> Mongo
    Delivery --> Mongo
    Payment --> Mongo

    Restaurant <--> Redis[(Redis)]
    Order <--> Redis
    Delivery <--> Redis

    Order <--> RabbitMQ[(RabbitMQ)]
    Payment <--> RabbitMQ
    Delivery <--> RabbitMQ


The API Gateway is the external entry point. The five application
services communicate with one another using configured internal service
URLs and RabbitMQ events. MongoDB is used by the services for
persistence; Redis supports caching and delivery assignment
coordination.

## Technology Stack

  -----------------------------------------------------------------------
  Area                                Technologies
  ----------------------------------- -----------------------------------
  Runtime and API                     Node.js, Express.js

  Database                            MongoDB, Mongoose

  Authentication                      JSON Web Tokens (JWT), bcrypt

  Cache and coordination              Redis

  Messaging                           RabbitMQ, AMQP

  Event reliability                   Transactional Outbox,
                                      processed-event tracking, retry
                                      queue, Dead Letter Queue

  Gateway                             Express-based API Gateway, HTTP
                                      proxying, request logging, rate
                                      limiting

  Containers                          Docker, Docker Compose

  Orchestration                       Kubernetes, Minikube, Kustomize

  Testing tools                       Jest, Supertest, Postman
  -----------------------------------------------------------------------

## Services

  ------------------------------------------------------------------------
  Component                                     Port Responsibility
  --------------------- ---------------------------- ---------------------
  API Gateway                                   5000 Routes client
                                                     requests to
                                                     application services,
                                                     adds request IDs,
                                                     logs responses,
                                                     applies rate
                                                     limiting, and blocks
                                                     selected internal
                                                     paths

  User Service                                  5001 Customer,
                                                     restaurant-owner, and
                                                     delivery-partner
                                                     registration and
                                                     login

  Restaurant Service                            5002 Restaurant and menu
                                                     management, menu
                                                     lookup and validation

  Order Service                                 5003 Order creation, order
                                                     status transitions,
                                                     cancellation,
                                                     delivery assignment
                                                     coordination, and
                                                     outbox publishing

  Delivery Service                              5004 Delivery partner
                                                     profiles,
                                                     online/availability
                                                     state, location,
                                                     nearest-partner
                                                     selection, assignment
                                                     and completion

  Payment Service                               5005 Simulated payment
                                                     status handling,
                                                     refunds, and
                                                     asynchronous
                                                     payment-event
                                                     consumption
  ------------------------------------------------------------------------

Menu endpoints are part of the Restaurant Service; there is no separate
Menu Service.

## Order Lifecycle

The main order workflow is coordinated by the Order Service:

1.  A customer submits an order through the API Gateway.
2.  The Order Service asks the Restaurant Service to validate the
    requested menu items and obtain authoritative prices.
3.  The Order Service creates the order and its `order.created` outbox
    event in the same MongoDB transaction.
4.  The outbox publisher publishes pending events to the RabbitMQ topic
    exchange `food_delivery_events`.
5.  The Payment Service consumes payment events and records processed
    event identifiers to avoid processing the same event more than once.
6.  Restaurant staff progress the order through `CONFIRMED`,
    `PREPARING`, and `READY`.
7.  When the order becomes ready, an `order.ready` event is published
    for delivery processing.
8.  The Order Service coordinates nearest-partner lookup and assignment
    through the Delivery Service.
9.  The delivery partner progresses the order through pickup and
    delivery states.
10. On completion, the Delivery Service updates the partner's delivery
    count and availability.

The implemented order transitions include:

-   Restaurant: `PLACED → CONFIRMED → PREPARING → READY`
-   Customer cancellation: `PLACED → CANCELLED`
-   Delivery partner: `READY → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED`

Online payment status is checked before restaurant confirmation.
Cancellation of an already-paid online order invokes the refund
workflow.

## Distributed Systems Features

### Transactional Outbox

The Order Service writes the order and its outbox event in one MongoDB
transaction. A separate publisher sends pending events to RabbitMQ and
waits for publisher confirms. This reduces the risk of committing an
order without recording the event that downstream services need.

### Event-driven communication

RabbitMQ uses the topic exchange `food_delivery_events` and routing keys
such as `order.created` and `order.ready`. Payment and delivery
workflows consume asynchronous events rather than relying exclusively on
synchronous HTTP calls.

### Idempotent event processing

The Payment Service stores processed event identifiers. When a
previously processed event is delivered again, the consumer can ignore
the duplicate rather than repeat the processing operation.

### Retry queues and Dead Letter Queue

Payment event processing includes bounded retries, a retry queue with a
message TTL, and a Dead Letter Queue (DLQ) for messages that exceed the
retry limit. DLQ recovery was also exercised during project testing.

### Redis caching

Redis is used for restaurant/menu and order-related cache entries. Cache
entries use a 600-second TTL in the implemented cache paths, with
relevant cache invalidation on updates.

### Redis distributed locking

Delivery partner assignment uses a Redis lock acquired with
`SET ... NX EX` and a unique token. The critical section checks partner
availability and marks the partner unavailable before releasing the
lock. This helps prevent concurrent assignment attempts from selecting
the same available partner.

### API Gateway observability and rate limiting

The gateway generates UUID request IDs, returns them in `X-Request-ID`,
and writes persistent request logs. Logs include method, path, response
status, response time, and request ID, with INFO/WARN/ERROR
classification. Rate limiting is configured at 100 requests per minute.

## Authentication and Authorization

JWT authentication and role-based authorization are implemented in the
relevant application services.

-   JWTs are issued at login and stored in an HTTP-only cookie named
    `token`.
-   Tokens are signed using `JWT_SECRET` and have a seven-day expiry.
-   Passwords are hashed using bcrypt.
-   Roles used by the application include `customer`,
    `restaurant_owner`, `delivery_partner`, and `admin`.
-   Service routes apply authentication and role middleware where
    configured.

The API Gateway is responsible for routing and gateway-level controls;
JWT authentication and authorization remain in the individual services.

**Security scope:** Internal service endpoints are used for
inter-service operations. A separate shared-secret or API-key
authentication mechanism for all internal HTTP calls is not implemented
in this version. Some internal routes do not have route-level
authentication middleware. Treat the current deployment as a
development/portfolio project and review these routes before exposing
the system to an untrusted network.

## API Reference

All client-facing requests should be sent through the API Gateway at
`http://localhost:5000` when running the Docker Compose setup. The
gateway routes requests by path.

  ----------------------------------------------------------------------------------------------------
  Method            Gateway path                           Description       Access
  ----------------- -------------------------------------- ----------------- -------------------------
  POST              `/api/users/register`                  Register a user   Public

  POST              `/api/users/login`                     Log in and        Public
                                                           receive the token 
                                                           cookie            

  POST              `/api/restaurants`                     Create a          Restaurant owner
                                                           restaurant        

  GET               `/api/restaurants`                     List restaurants  Public

  GET               `/api/restaurants/:id`                 Get restaurant    Public
                                                           details           

  PUT               `/api/restaurants/:id`                 Update a          Owner/admin middleware
                                                           restaurant        

  DELETE            `/api/restaurants/:id`                 Delete a          Owner/admin middleware
                                                           restaurant        

  POST              `/api/menu`                            Create a menu     Restaurant owner/admin
                                                           item              

  GET               `/api/menu/restaurant/:restaurantId`   List a            Public
                                                           restaurant's menu 

  GET               `/api/menu/:id`                        Get a menu item   Public

  PUT               `/api/menu/:id`                        Update a menu     Restaurant owner/admin
                                                           item              

  DELETE            `/api/menu/:id`                        Delete a menu     Restaurant owner/admin
                                                           item              

  POST              `/api/orders`                          Create an order   Customer

  GET               `/api/orders/my`                       Get the           Customer
                                                           customer's orders 

  GET               `/api/orders/restaurant`               Get orders for    Restaurant owner
                                                           the owner's       
                                                           restaurant        

  GET               `/api/orders/delivery`                 Get orders        Delivery partner
                                                           assigned to the   
                                                           delivery partner  

  GET               `/api/orders/:id`                      Get an order      Authenticated user

  PATCH             `/api/orders/:id/status`               Update order      Customer/owner/delivery
                                                           status            partner, subject to
                                                                             transition rules

  PATCH             `/api/orders/:id/assign`               Assign a delivery Restaurant owner/admin
                                                           partner           route; controller applies
                                                                             additional checks

  POST              `/api/delivery`                        Create delivery   Delivery partner
                                                           partner profile   

  GET               `/api/delivery/profile`                Get own delivery  Delivery partner
                                                           profile           

  PATCH             `/api/delivery/online`                 Update online     Delivery partner
                                                           status            

  PATCH             `/api/delivery/availability`           Update            Delivery partner
                                                           availability      

  PATCH             `/api/delivery/location`               Update current    Delivery partner
                                                           location          

  POST              `/api/payments`                        Create/process a  See service route
                                                           simulated payment configuration

  GET               `/api/payments/order/:orderId`         Get payment for   See service route
                                                           an order          configuration

  PATCH             `/api/payments/refund`                 Refund a paid     See service route
                                                           order             configuration
  ----------------------------------------------------------------------------------------------------

The following paths are internal service endpoints and are not intended
for direct client use:

-   `/api/menu/internal/validate`
-   `/api/restaurants/owner/:ownerId`
-   `/api/orders/internal/payment-status`
-   `/api/orders/internal/payment/:orderId`
-   `/api/delivery/internal/*`

The gateway blocks selected internal path prefixes. Internal endpoint
authentication is not uniform across all services in this version; see
[Authentication and Authorization](#authentication-and-authorization).

## Prerequisites

For the Docker Compose workflow:

-   Docker Desktop with Docker Engine and Docker Compose.
-   Git.

For the Kubernetes workflow:

-   Docker Desktop.
-   Minikube.
-   `kubectl`.
-   Kustomize support through `kubectl apply -k`.

Node.js and npm are useful for running an individual service or the root
test command outside containers.

## Run with Docker Compose

The Compose configuration uses locally built images with
`pull_policy: never`, so build the images before starting the stack.

### 1. Clone the repository


git clone <YOUR_REPOSITORY_URL>
cd <YOUR_REPOSITORY_DIRECTORY>


### 2. Configure environment files

Create the root `.env.docker` file for Compose variable interpolation
and create the service-specific `.env` files referenced by
`docker-compose.yml`.

At minimum, configure the RabbitMQ credentials expected by Compose in
`.env.docker`:

``` dotenv
RABBITMQ_USER=your_rabbitmq_username
RABBITMQ_PASSWORD=your_strong_rabbitmq_password
```

Populate each service's `.env` file with the environment variables that
service reads. Do not commit real credentials, tokens, or `.env` files.

### 3. Build the application images

Run from the repository root:

``` bash
docker build -t food-delivery-user-service:latest ./services/user-service
docker build -t food-delivery-restaurant-service:latest ./services/restaurant-service
docker build -t food-delivery-order-service:latest ./services/order-service
docker build -t food-delivery-delivery-service:latest ./services/delivery-service
docker build -t food-delivery-payment-service:latest ./services/payment-service
docker build -t food-delivery-api-gateway:latest ./services/api-gateway
```

### 4. Start the stack

``` bash
docker compose --env-file .env.docker up -d
```

### 5. Inspect containers and logs

``` bash
docker compose ps
docker compose logs -f
```

To follow one component:

``` bash
docker compose logs -f order-service
```

The API Gateway is mapped to host port `5000`. Use
`http://localhost:5000` as the client-facing base URL. The RabbitMQ
management interface is configured on port `15672`; its credentials are
the values configured for RabbitMQ.

### 6. Stop the stack

``` bash
docker compose down
```

To remove named volumes as well (this deletes persisted local database,
Redis, and RabbitMQ data):

``` bash
docker compose down -v
```

## Run on Kubernetes with Minikube

The Kubernetes manifests are organized under `k8s/` and applied using
Kustomize.

### 1. Start Minikube

``` bash
minikube start
```

### 2. Build images for the Minikube runtime

The Deployments use `IfNotPresent` and the image names below. Build or
load each image into the Minikube image runtime before applying the
manifests.

``` bash
docker build -t food-delivery-user-service:latest ./services/user-service
docker build -t food-delivery-restaurant-service:latest ./services/restaurant-service
docker build -t food-delivery-order-service:latest ./services/order-service
docker build -t food-delivery-delivery-service:latest ./services/delivery-service
docker build -t food-delivery-payment-service:latest ./services/payment-service
docker build -t food-delivery-api-gateway:latest ./services/api-gateway

minikube image load food-delivery-user-service:latest
minikube image load food-delivery-restaurant-service:latest
minikube image load food-delivery-order-service:latest
minikube image load food-delivery-delivery-service:latest
minikube image load food-delivery-payment-service:latest
minikube image load food-delivery-api-gateway:latest
```

If you build directly inside Minikube's Docker runtime instead, use the
corresponding Minikube Docker environment before building.

### 3. Create the required Kubernetes Secrets

The manifests reference these Secrets:

-   `rabbitmq-secret`
-   `user-service-secret`
-   `restaurant-service-secret`
-   `order-service-secret`
-   `delivery-service-secret`
-   `payment-service-secret`
-   `api-gateway-secret`

The supplied Kustomize resources reference these Secrets but do not
define them as YAML resources. Create them in the `food-delivery`
namespace before applying the workloads. RabbitMQ specifically expects
keys named `RABBITMQ_USER` and `RABBITMQ_PASSWORD`. For each application
Secret, provide the keys required by that service's configuration (for
example, `JWT_SECRET` where the service verifies JWTs). Do not put
secret values in ConfigMaps or commit them to Git.

Example for RabbitMQ (replace the placeholders locally):

``` bash
kubectl create namespace food-delivery
kubectl -n food-delivery create secret generic rabbitmq-secret \
  --from-literal=RABBITMQ_USER='<your-user>' \
  --from-literal=RABBITMQ_PASSWORD='<your-password>'
```

Create the six application Secrets in the same namespace with the
environment-variable keys required by their respective services before
continuing.

### 4. Apply the manifests

``` bash
kubectl apply -k k8s/
```

### 5. Check deployment status

``` bash
kubectl get all -n food-delivery
kubectl get pvc -n food-delivery
kubectl get pods -n food-delivery -w
```

Inspect a workload's logs:

``` bash
kubectl logs -n food-delivery deployment/order-service
```

### 6. Access the API Gateway

``` bash
minikube service api-gateway -n food-delivery --url
```

Use the URL returned by Minikube as the client-facing API base URL. The
API Gateway Service is configured as a NodePort using node port `30000`.

To remove the Kubernetes resources:

``` bash
kubectl delete -k k8s/
```

PersistentVolumeClaims and retained data may require separate cleanup
depending on the storage provisioner and resource state.

## Environment Configuration

The application source references these environment variables:

  Variable                   Purpose
  -------------------------- -------------------------------------
  `PORT`                     HTTP port for the service
  `MONGO_URI`                MongoDB connection URI
  `REDIS_URL`                Redis connection URL
  `RABBITMQ_URL`             RabbitMQ connection URL
  `JWT_SECRET`               JWT signing and verification secret
  `NODE_ENV`                 Runtime environment
  `USER_SERVICE_URL`         User Service base URL
  `RESTAURANT_SERVICE_URL`   Restaurant Service base URL
  `ORDER_SERVICE_URL`        Order Service base URL
  `DELIVERY_SERVICE_URL`     Delivery Service base URL
  `PAYMENT_SERVICE_URL`      Payment Service base URL

Not every service uses every variable. Supply only the variables
required by each service's code and startup configuration. In Docker
Compose, the service-specific `.env` files and root `.env.docker` are
used for container configuration and Compose interpolation. In
Kubernetes, non-sensitive settings are supplied through generated
ConfigMaps and sensitive values through pre-created Secrets.

**Never publish actual `.env` contents, database credentials, JWT
secrets, or RabbitMQ passwords.**

## Testing and Verification

The repository includes a root Jest test command and an Order Service
Jest test setup. The project was also exercised through manual API and
infrastructure testing.

Run the root test command:

``` bash
npm install
npm test
```

The Order Service test command can be run from its service directory:

``` bash
cd services/order-service
npm install
npm test
```

Use Postman or another HTTP client to exercise registration/login,
restaurant and menu operations, order creation, status transitions,
delivery partner operations, payment status handling, and refunds.

Infrastructure and reliability scenarios exercised during development
include:

-   MongoDB transaction and outbox publishing flow.
-   RabbitMQ event consumption and duplicate-event handling.
-   Payment retry and DLQ behaviour.
-   Redis cache and distributed-lock behaviour.
-   API Gateway request IDs, logs, and rate limiting.
-   Docker Compose startup and Minikube deployment verification.

Automated test coverage is not uniform across all services. Some service
package manifests still contain placeholder test scripts; manual
integration testing was used for those components.

## Repository Structure

``` text
.
├── config/                       # Root database configuration
├── controllers/                  # Legacy/root application controllers
├── models/                       # Legacy/root application models
├── routes/                       # Legacy/root application routes
├── tests/                        # Root Jest tests
├── services/
│   ├── api-gateway/
│   ├── user-service/
│   ├── restaurant-service/
│   ├── order-service/
│   ├── delivery-service/
│   └── payment-service/
├── k8s/
│   ├── infrastructure/
│   │   ├── mongodb/
│   │   ├── redis/
│   │   └── rabbitmq/
│   ├── services/
│   ├── kustomization.yaml
│   └── namespace.yaml
├── utils/
├── docker-compose.yml
├── index.js
├── package.json
└── README.md
```

The `services/` directory contains the microservice implementation used
by the distributed deployment. The root-level application files are
retained in the repository as the earlier/legacy application structure.

## Known Limitations and Future Work

-   **Cloud deployment:** The current documented deployment targets
    Docker Compose and local Minikube. Cloud deployment is deferred.
-   **Payment integration:** Payment processing is simulated; no live
    Razorpay, Stripe, or other payment gateway is integrated.
-   **Internal service security:** A consistent shared-secret or
    service-identity mechanism for internal HTTP endpoints remains
    future work.
-   **Automated integration tests:** Test automation is not yet uniform
    across all services.
-   **Kubernetes secrets:** Secret resources must be created separately
    before applying the current Kustomize configuration.
-   **Scaling and resilience:** The current Kubernetes manifests use one
    replica per application and infrastructure component. Production
    scaling, high availability, backups, monitoring, and resource tuning
    require further work.

## Project Scope

This repository demonstrates the design and local deployment of a
distributed backend using microservices, synchronous service
communication, asynchronous events, caching, distributed locking,
reliable event publication, retries, and container orchestration.

Cloud deployment and production hardening are outside the current
Version 1.0 scope.
