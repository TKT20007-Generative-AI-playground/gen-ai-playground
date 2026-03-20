## Gen-AI-Playground

This project is a generative AI playground for comparing both text-to-image and text generation models. You can provide a desired image description to compare different image models, compare various text models, and also edit images using different models.

The project is carried out in cooperation with Verda


## Contents

- [Architecture](#architecture)
- [Running the application locally](#running-the-application-locally)
- [Environment variables and Docker Compose](#environment-variables-and-docker-compose)
- [Running frontend and backend separately](#running-frontend-and-backend-separately)
- [OpenShift instructions](#openshift-instructions)
- [Verda documentation](#verda-documentation)
---

## Architecture

For a detailed overview of the system architecture, see [architecture.md](Documents/architecture.md).

---


## Running the application locally

1. Install [Docker Desktop](https://docs.docker.com/get-started/introduction/get-docker-desktop/) on your computer.
2. Navigate to the `gen-ai-playground` directory.
3. Start the entire application with:


   ```sh
   docker compose up --build
   ```

   This will start both the frontend and backend, as well as the required database and cache services (MongoDB, Redis).

   **Tip for development:**
   For easier development with hot reload enabled in both frontend and backend, you can use the development compose file:


   ```sh
   docker compose -f docker-compose.dev.yml up --build
   ```

   This will enable hot reload for both services.

4. The application will be available in your browser at [http://localhost:5173](http://localhost:5173)

### Backend tests

```sh
docker compose build backend-tests
docker compose run --rm backend-tests
```

---


## Environment variables

There are two ways to provide environment variables, depending on how you run the application:


### With Docker Compose

When using Docker Compose, environment variables are specified directly in the `docker-compose.yml` and `docker-compose.dev.yml` files under the `environment:` section. Only the variables listed in this section are passed to the application inside the container. Example:

```yaml
environment:
   - ALLOWED_ORIGINS=http://localhost:5173
   - MONGO_DB_URL=mongodb://mongodb:27017
   - JWT_SECRET_KEY=dev-secret-key-for-local-development
   - JWT_REFRESH_SECRET_KEY=dev-refresh-secret-key-for-local-development
   - ADMIN_USERNAME=admin
   - ADMIN_PASSWORD=Localadmin123!
   # Add other secrets as needed
```

> **Important:** Secrets such as `VERDA_API_KEY`, `VERDA_CLIENT_ID`, `VERDA_CLIENT_SECRET`, and `HF_TOKEN` are not included in the default Compose environment section. To use these with Docker Compose, you must either:
> - Add them directly to the `environment:` section in your Compose file, **or**
> - Create a `backend/.env.local`

> Example `backend/.env.local` file:
```env
# Verda integration (keep these secret!)
VERDA_API_KEY="your-verda-api-key"
VERDA_CLIENT_ID="your-verda-client-id"
VERDA_CLIENT_SECRET="your-verda-client-secret"

# Hugging Face (for serverless model containers)
HF_TOKEN="your-huggingface-token"
```

> These secrets are loaded automatically by the application using the `dotenv` library from the `backend/.env.local` file when running inside the container.




### Without Docker Compose (local development)

When running the backend and frontend directly (not in Docker), you can use `.env` files in the respective directories. 

**Backend .env.local example:**

```env
# Database
MONGO_DB_URL="mongodb://mongodb:27017"

# Verda integration (keep these secret!)
VERDA_API_KEY="your-verda-api-key"
VERDA_CLIENT_ID="your-verda-client-id"
VERDA_CLIENT_SECRET="your-verda-client-secret"

# Hugging Face (for serverless model containers)
HF_TOKEN="your-huggingface-token"

# Application secrets (keep these secret!)
JWT_SECRET_KEY="dev-secret-key-for-local-development"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="Localadmin123!"

# CORS
ALLOWED_ORIGINS="http://localhost:5173"
```

**Frontend .env:**

```env
VITE_API_URL=http://localhost:8000
```

---

## Running frontend and backend separately (without Docker Compose)

You can run the backend and frontend directly for development:

**Backend:**

```sh
cd backend
pip install -r requirements.txt
uvicorn app.server:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**

```sh
cd frontend
npm install
npm run dev
```

---

## OpenShift instructions

1. Create the required imagestreams and volumes in your OpenShift cluster:
   - Manifests can be found in the [manifests/backend/](manifests/backend/) and [manifests/frontend/](manifests/frontend/) directories.
2. Build and push Docker images to your registry (you can use OpenShift's internal registry or another one):
   - Edit imagestream names and tags in the manifest files if needed.
3. Apply the manifests in OpenShift:

   ```sh
   oc apply -f manifests/backend/
   oc apply -f manifests/frontend/
   ```

4. The application will be available via the route address defined by OpenShift.

5. The required environment variables for the backend (such as ALLOWED_ORIGINS, VERDA_API_KEY, MONGO_DB_URL, INVITATION_CODE, JWT_SECRET_KEY, VERDA_CLIENT_SECRET, VERDA_CLIENT_ID, HF_TOKEN, ADMIN_USERNAME, ADMIN_PASSWORD, and JWT_REFRESH_SECRET_KEY) are defined in the example [manifests/backend/deployment.yaml](manifests/backend/deployment.yaml). Make sure to set these in your OpenShift environment, using secrets where appropriate for sensitive values.

---

## Verda documentation

See detailed instructions and documentation: [Verda](https://verda.com/)

---

## Links

- [Backlog](https://github.com/orgs/TKT20007-Generative-AI-playground/projects/4)