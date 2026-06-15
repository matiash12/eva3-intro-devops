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

El archivo `.github/workflows/deploy.yml` se dispara en cada push a `main` y ejecuta dos jobs en secuencia:

### Job 1 — Build & Push
1. Hace checkout del código.
2. Configura credenciales AWS usando los GitHub Secrets.
3. Hace login al ECR de AWS.
4. Construye la imagen Docker del **backend** y la etiqueta con el SHA corto del commit y `:latest`.
5. Hace push de ambas etiquetas al repositorio ECR del backend.
6. Repite los pasos 4-5 para el **frontend** (pasando `REACT_APP_BACKEND_URL` vacío; el frontend accede al backend mediante la URL del LoadBalancer directamente).

### Job 2 — Deploy
1. Configura credenciales AWS.
2. Actualiza el `kubeconfig` local apuntando al cluster `eva3` en `us-east-1`.
3. Ejecuta `kubectl apply -f k8s/` para crear/actualizar todos los recursos.
4. Usa `kubectl set image` para fijar la imagen con el SHA exacto del commit en cada Deployment (evita pull de `:latest` que podría no ser consistente).
5. Espera a que los rollouts de backend y frontend completen (`rollout status`).
6. Imprime el estado final de pods, servicios y HPA, y espera hasta 2 minutos por el hostname del LoadBalancer del `frontend-svc`.

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

### 2. Obtener la URL pública del frontend (LoadBalancer)

> **Nota sobre AWS Academy:** El entorno AWS Academy (rol `voclabs`) no permite crear OIDC
> providers ni IAM roles nuevos, lo que impide usar el AWS Load Balancer Controller / Ingress.
> En su lugar, el `frontend-svc` es de tipo `LoadBalancer`, que EKS provisiona automáticamente
> como un Classic Load Balancer (CLB) o Network Load Balancer (NLB) sin requerir permisos IAM adicionales.

```bash
kubectl get svc frontend-svc
# La columna EXTERNAL-IP muestra el hostname del LoadBalancer de AWS
# Puede tardar 2-3 minutos en asignarse
```

El pipeline de GitHub Actions también imprime la URL al final del job de deploy.

Accede a `http://<EXTERNAL-IP>` en el navegador. Verás la app React.

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
         │  → frontend pods     │
         └──────────────────────┘
         ┌──────────────────────┐
         │  backend-svc         │
         │  (ClusterIP)         │ ← acceso interno
         │  → backend pods      │
         └──────────────────────┘
              HPA activo
```
