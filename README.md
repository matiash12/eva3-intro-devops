# Eva3 - ISY1101 Introducción a Herramientas DevOps

Proyecto de evaluación parcial N°3. Despliega una aplicación **Frontend (React) + Backend (Spring Boot)** en un clúster **AWS EKS** con autoscaling, pipeline CI/CD y buenas prácticas DevOps.

---

## Estructura del repositorio

```
eva3-intro-devops/
├── backend/                   # App Spring Boot (Java 17)
│   ├── src/
│   │   └── main/java/com/eva3/backend/
│   │       ├── BackendApplication.java
│   │       └── controller/ApiController.java
│   ├── pom.xml
│   └── Dockerfile             # Multi-stage: Maven build + JRE alpine
│
├── frontend/                  # App React 18
│   ├── src/
│   │   ├── App.js             # Componente principal que consume el backend
│   │   └── index.js
│   ├── public/index.html
│   ├── package.json
│   ├── nginx.conf             # Configuración Nginx para SPA
│   └── Dockerfile             # Multi-stage: Node build + Nginx alpine
│
├── k8s/                       # Manifiestos de Kubernetes
│   ├── backend-deployment.yaml
│   ├── backend-service.yaml
│   ├── frontend-deployment.yaml
│   ├── frontend-service.yaml  # tipo LoadBalancer — expone el frontend públicamente
│   ├── hpa-backend.yaml       # HPA backend (CPU 50%, 2-6 réplicas)
│   └── hpa-frontend.yaml      # HPA frontend (CPU 50%, 2-4 réplicas)
│
└── .github/workflows/
    └── deploy.yml             # Pipeline CI/CD GitHub Actions
```

---

## Cómo correr el proyecto localmente

### Requisitos previos
- Java 17+, Maven 3.9+
- Node.js 20+, npm
- Docker (opcional, para correr con contenedores)

### Backend

```bash
cd backend
mvn spring-boot:run
```

Endpoints disponibles:
- `GET http://localhost:8080/api/health` → estado del servicio
- `GET http://localhost:8080/api/students` → lista de estudiantes de ejemplo
- `GET http://localhost:8080/actuator/health` → health check de Spring Actuator

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
REACT_APP_BACKEND_URL=http://localhost:8080 npm start
```

Abre `http://localhost:3000` en el navegador.

### Con Docker Compose (desarrollo local rápido)

```bash
# Backend
docker build -t eva3-backend ./backend
docker run -p 8080:8080 eva3-backend

# Frontend (en otra terminal)
docker build \
  --build-arg REACT_APP_BACKEND_URL=http://localhost:8080 \
  -t eva3-frontend ./frontend
docker run -p 3000:80 eva3-frontend
```

---

## Cómo funciona el pipeline CI/CD

El archivo `.github/workflows/deploy.yml` se dispara en cada push a `main` y ejecuta **4 jobs en cadena**:

```
build-backend ──► deploy-backend ──► build-frontend ──► deploy-frontend
```

### Por qué este orden importa

React "hornea" las variables de entorno en el bundle JavaScript **en build-time**, no en runtime. La URL pública del backend (`REACT_APP_API_URL`) se conoce solo después de que EKS provisione el LoadBalancer, lo que ocurre cuando se despliega el backend. Por eso el build del frontend **debe** hacerse después del deploy del backend.

### Job 1 — Build backend
1. Construye la imagen Docker del backend y la etiqueta con el SHA corto del commit.
2. Hace push de las etiquetas `:<sha>` y `:latest` al ECR del backend.

### Job 2 — Deploy backend & obtener URL
1. Aplica los manifiestos del backend (`deployment`, `service`, `hpa`).
2. Fija la imagen con el SHA exacto del commit (`kubectl set image`).
3. Espera a que el rollout complete.
4. Espera hasta 2 minutos por el hostname del LoadBalancer del `backend-svc`.
5. Expone ese hostname como output (`backend-url`) para el siguiente job.

### Job 3 — Build frontend
1. Recibe `backend-url` del job anterior como variable de entorno.
2. Construye la imagen Docker del frontend pasando `REACT_APP_API_URL=http://<backend-lb-hostname>` como build-arg, de modo que queda permanentemente incorporado en el bundle de producción.
3. Hace push de la imagen al ECR del frontend.

### Job 4 — Deploy frontend
1. Aplica los manifiestos del frontend (`deployment`, `service`, `hpa`).
2. Fija la imagen con el SHA exacto del commit.
3. Espera a que el rollout complete.
4. Imprime la URL pública del frontend.

---

## Secrets de GitHub necesarios

Ve a **GitHub → tu repositorio → Settings → Secrets and variables → Actions → New repository secret** y crea los siguientes:

| Secret | Descripción |
|---|---|
| `AWS_ACCESS_KEY_ID` | Access Key del usuario/rol IAM con permisos de ECR y EKS |
| `AWS_SECRET_ACCESS_KEY` | Secret Key correspondiente |
| `AWS_SESSION_TOKEN` | **Solo si usas credenciales temporales** (Academy, roles asumidos, etc.) |

### Permisos IAM mínimos requeridos

El usuario/rol IAM debe tener las siguientes políticas adjuntas:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster"
      ],
      "Resource": "arn:aws:eks:us-east-1:821111072781:cluster/eva3"
    }
  ]
}
```

Además, el usuario debe estar en el `aws-auth` ConfigMap del cluster EKS (ver sección de pasos manuales).

---

## Infraestructura AWS

| Recurso | Valor |
|---|---|
| Región | `us-east-1` |
| Cluster EKS | `eva3` |
| ECR Backend | `821111072781.dkr.ecr.us-east-1.amazonaws.com/eva3-backend` |
| ECR Frontend | `821111072781.dkr.ecr.us-east-1.amazonaws.com/eva3-frontend` |

---

## Autoscaling (HPA)

| Componente | Min réplicas | Max réplicas | Umbral CPU |
|---|---|---|---|
| backend | 2 | 6 | 50% |
| frontend | 2 | 4 | 50% |

El HPA requiere que **Metrics Server** esté instalado en el cluster:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

---

## Cómo verificar que todo funciona

### 1. Verificar pods en ejecución

```bash
kubectl get pods -o wide
# Esperado: 2 pods de backend + 2 pods de frontend en estado Running
```

### 2. Obtener las URLs públicas (LoadBalancers)

> **Nota sobre AWS Academy:** El entorno AWS Academy (rol `voclabs`) no permite crear OIDC
> providers ni IAM roles nuevos. Ambos servicios usan `type: LoadBalancer`; EKS provisiona
> un Classic Load Balancer (CLB) automáticamente sin requerir permisos IAM adicionales.

```bash
# URL del backend (capturada automáticamente por el pipeline)
kubectl get svc backend-svc
# → EXTERNAL-IP = hostname del LB del backend

# URL del frontend (impresa al final del último job del pipeline)
kubectl get svc frontend-svc
# → EXTERNAL-IP = hostname del LB del frontend
```

El pipeline imprime ambas URLs en los logs de GitHub Actions. Accede a
`http://<frontend-EXTERNAL-IP>` en el navegador para ver la app React completa.

### 3. Verificar el autoscaling

```bash
# Ver estado actual del HPA
kubectl get hpa

# Generar carga para disparar el escalado (desde otra terminal)
kubectl run -it --rm load-test --image=busybox --restart=Never -- \
  sh -c "while true; do wget -q -O- http://backend-svc/api/health > /dev/null; done"

# Observar cómo el HPA aumenta réplicas
kubectl get hpa --watch
```

### 4. Ver logs de los pods

```bash
# Logs del backend (reemplaza con el nombre real del pod)
kubectl logs -l app=backend --tail=50 -f

# Logs del frontend (Nginx)
kubectl logs -l app=frontend --tail=50 -f
```

### 5. Verificar el pipeline en GitHub Actions

Ve a **GitHub → tu repositorio → Actions** y verifica que el workflow `CI/CD - Build & Deploy to EKS` haya completado exitosamente en verde.

---

## Resumen del flujo completo

```
git push → GitHub Actions
               │
               ▼
        [Job: Build & Push]
        docker build backend  → ECR
        docker build frontend → ECR
               │
               ▼
         [Job: Deploy]
        aws eks update-kubeconfig
        kubectl apply -f k8s/
        kubectl set image ...
        kubectl rollout status
               │
               ▼
         EKS Cluster (eva3)
         ┌──────────────────────┐
         │  frontend-svc        │
         │  (LoadBalancer/CLB)  │ ← URL pública :80
         │  → frontend pods     │   (bundle incluye URL del backend)
         └──────────────────────┘
         ┌──────────────────────┐
         │  backend-svc         │
         │  (LoadBalancer/CLB)  │ ← URL pública :80
         │  → backend pods      │   (hostname capturado en build-time)
         └──────────────────────┘
              HPA activo
```
