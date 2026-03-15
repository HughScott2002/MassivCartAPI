PROJECT_ID  := massivecart-api
REGION      := us-central1
SERVICE     := massivecart-api
REPO        := massivecart
IMAGE       := $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(REPO)/api
TAG         := $(shell git rev-parse --short HEAD 2>/dev/null || echo "latest")

.PHONY: registry build push deploy release

## First-time setup: create Artifact Registry repo + configure Docker auth
registry:
	gcloud artifacts repositories create $(REPO) \
	  --repository-format=docker \
	  --location=$(REGION) \
	  --project=$(PROJECT_ID) 2>/dev/null || true
	gcloud auth configure-docker $(REGION)-docker.pkg.dev --quiet

## Build image tagged with git SHA + latest
build:
	docker build -t $(IMAGE):$(TAG) -t $(IMAGE):latest .

## Refresh Docker auth (access token, valid ~1hr) then push both tags
push:
	gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin us-central1-docker.pkg.dev
	docker push $(IMAGE):$(TAG)
	docker push $(IMAGE):latest

## Deploy the git-SHA-tagged image to Cloud Run
deploy:
	gcloud run deploy $(SERVICE) \
	  --image $(IMAGE):$(TAG) \
	  --region $(REGION) \
	  --platform managed \
	  --allow-unauthenticated \
	  --port 8080 \
	  --project $(PROJECT_ID)

## One shot: build → push → deploy
release: build push deploy
