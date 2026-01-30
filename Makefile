.PHONY: help samples samples-build clean

# Docker image name
DOCKER_IMAGE := iosepta-samples

help:
	@echo "Iosepta Mono Sample Image Generator"
	@echo ""
	@echo "Usage:"
	@echo "  make samples       - Generate sample images (requires Docker)"
	@echo "  make samples-build - Build Docker image only"
	@echo "  make clean         - Remove Docker image"

samples-build:
	docker build -t $(DOCKER_IMAGE) -f scripts/sample-images/Dockerfile .

samples: samples-build
	docker run --rm -v "$$(pwd)/images:/out" $(DOCKER_IMAGE)

clean:
	docker rmi $(DOCKER_IMAGE) 2>/dev/null || true
