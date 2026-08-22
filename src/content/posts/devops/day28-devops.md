---
title: "Day 28: Docker - Building and managing images"
date: "2023-05-16"
description: "Content Part 1: Introduction to DevOps Day 1: Understanding DevOps, its principles, and benefits Day 2: Exploring the DevOps lifecycle and its stages Day 3: Introduction to Continuous Integration (CI) and Continuous Deployment (CD) Day 4: Familiarizing with common DevOps tools and technologies Day 5: Studying DevOps culture and best practices Part 2: Version Control Systems Day 6: Introduction to Git Day 7: Basic Git commands (git init, git add, git commit, git status) Day 8: Branching and merging in Git Day 9: Remote repositories and collaboration with Git Day 10: Git workflows and best practices Part 3: Continuous Integration and Continuous Deployment (CI/CD)"
categories: ["DevOps", "Software Development", "Automation", "Infrastructure", "Containerization", "Docker"]
tags: ["DevOps", "CI/CD", "Containerization", "Docker"]
draft: false
---

> **INFO — Content**
> 
> **Part 1: Introduction to DevOps**
> 
> -   [Day 1: Understanding DevOps, its principles, and benefits](/posts/devops/day1-devops)
> -   [Day 2: Exploring the DevOps lifecycle and its stages](/posts/devops/day2-devops)
> -   [Day 3: Introduction to Continuous Integration (CI) and Continuous Deployment (CD)](/posts/devops/day3-devops)
> -   [Day 4: Familiarizing with common DevOps tools and technologies](/posts/devops/day4-devops)
> -   [Day 5: Studying DevOps culture and best practices](/posts/devops/day5-devops)
> 
> **Part 2: Version Control Systems**
> 
> -   [Day 6: Introduction to Git](/posts/devops/day6-devops)
> -   [Day 7: Basic Git commands (`git init`, `git add`, `git commit`, `git status`)](/posts/devops/day7-devops)
> -   [Day 8: Branching and merging in Git](/posts/devops/day8-devops)
> -   [Day 9: Remote repositories and collaboration with Git](/posts/devops/day9-devops)
> -   [Day 10: Git workflows and best practices](/posts/devops/day10-devops)
> 
> **Part 3: Continuous Integration and Continuous Deployment (CI/CD)**
> 
> -   [Day 11: Introduction to CI/CD](/posts/devops/day11-devops)
> -   [Day 12: Jenkins - Installation and configuration](/posts/devops/day12-devops)
> -   [Day 13: Jenkins - Creating and managing jobs](/posts/devops/day13-devops)
> -   [Day 14: Jenkins - Integrating with Git](/posts/devops/day14-devops)
> -   [Day 15: Jenkins - Pipelines and best practices](/posts/devops/day15-devops)
> 
> **Part 4: Configuration Management**
> 
> -   [Day 16: Introduction to configuration management](/posts/devops/day16-devops)
> -   [Day 17: Ansible - Installation and configuration](/posts/devops/day17-devops)
> -   [Day 18: Ansible - Ad-hoc commands and playbook](/posts/devops/day18-devops)
> -   [Day 19: Ansible - Roles and best practices](/posts/devops/day19-devops)
> -   [Day 20: Puppet and Chef - Overview and comparison](/posts/devops/day20-devops)
> 
> **Part 5: Infrastructure as Code**
> 
> -   [Day 21: Introduction to Infrastructure as Code (IaC)](/posts/devops/day21-devops)
> -   [Day 22: Terraform - Installation and configuration](/posts/devops/day22-devops)
> -   [Day 23: Terraform - Writing and applying configuration files](/posts/devops/day23-devops)
> -   [Day 24: Terraform - Modules and best practices](/posts/devops/day24-devops)
> -   **[Day 25: CloudFormation (AWS) - Overview and comparison](/posts/devops/day25-devops)**
> 
> **Part 6: Containerization**
> 
> -   [Day 26: Introduction to containerization](/posts/devops/day26-devops)
> -   [Day 27: Docker - Installation and configuration](/posts/devops/day27-devops)
> -   **[Day 28: Docker - Building and managing images](/posts/devops/day28-devops)**
> -   Day 29: Docker - Running and managing containers
> -   Day 30: Docker Compose and best practices
> 
> **Part 7: Container Orchestration**
> 
> -   Day 31: Introduction to container orchestration
> -   Day 32: Kubernetes - Architecture and components
> -   Day 33: Kubernetes - Deployments, services, and storage
> -   Day 34: Kubernetes - ConfigMaps and secrets
> -   Day 35: Kubernetes - Best practices and Helm
> 
> **Part 8: Monitoring and Logging**
> 
> -   Day 36: Introduction to monitoring and logging
> -   Day 37: Prometheus - Installation and configuration
> -   Day 38: Prometheus - Querying and alerting
> -   Day 39: Grafana - Installation and configuration
> -   Day 40: ELK Stack (Elasticsearch, Logstash, Kibana) - Overview and comparison
> 
> **Part 9: Cloud Platforms**
> 
> -   Day 41: Introduction to cloud platforms
> -   Day 42: AWS - EC2, S3, and RDS
> -   Day 43: AWS - IAM, VPC, and ELB
> -   Day 44: Azure - Virtual Machines, Storage, and SQL Database
> -   Day 45: Google Cloud Platform - Compute Engine, Storage, and Cloud SQL
> 
> **Part 10: DevOps Security**
> 
> -   Day 46: Introduction to DevOps security
> -   Day 47: Security best practices for CI/CD pipelines
> -   Day 48: Infrastructure and application security
> -   Day 49: Container and Kubernetes security
> -   Day 50: Cloud security and compliance

### Building docker image

A Docker image is a lightweight, standalone, and executable software package that includes everything needed to run a piece of software, including the code, runtime, system tools, libraries, and system dependencies. These images are built based on instructions provided in a Dockerfile, which contains a set of commands and configurations.

A Dockerfile might look something like this:

```docker
# This line specifies the base image for our Docker image. 
# In this case, we're using the official Python 3.9-slim image as the starting point.
FROM python:3.9-slim

# This sets the working directory inside the container to /app. 
# Any subsequent commands will be executed in this directory.
WORKDIR /app

# This copies the requirements.txt file from the host machine to the working directory of the container. 
# This file should contain the necessary Python dependencies for your FastAPI application.
COPY requirements.txt .

# This command installs the Python dependencies specified in the requirements.txt file using pip.
RUN pip install --no-cache-dir -r requirements.txt

# This copies the entire application code from the host machine to the working directory of the container.
COPY . .

# This instruction exposes port 7400 to allow communication with the FastAPI application running inside the container.
EXPOSE 7400

# This sets the default command to be executed when the container starts. 
# It uses the uvicorn server to run the FastAPI application specified in the main.py file, 
# and binds it to the host's IP address 0.0.0.0 on port 7400.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7400"]
```

Once you have this Dockerfile in your project directory, you can use the `docker build` command to build the Docker image. For example:

```console
docker build -t my-fastapi-app .
```

After successfully building the image, you can run a container using the image with the `docker run` command:

```console
docker run -p 7400:7400 my-fastapi-app
```

This will start the container and bind port 7400 of the container to port 7400 of the host machine, allowing you to access the FastAPI application at `http://localhost:7400`.

### Managing Docker images

Once you have built a Docker image, you can manage it efficiently using various Docker commands. Here are some essential Docker commands for image management:

1.  `docker tag`: The `docker tag` command allows you to add a new tag to an existing image. Tags are labels that provide a human-readable and meaningful name to an image, making it easier to reference and manage.
2.  `docker images`: This command lists all the Docker images present on your system along with their details such as the image ID, repository, tag, size, and creation date.
3.  `docker push`: Once you have built your image and want to share it with others, you can use the `docker push` command. It allows you to push your local image to a remote registry, making it accessible to others.
4.  `docker pull`: If you want to fetch an image from a remote registry, you can use the `docker pull` command. This command downloads the specified image from a registry like Docker Hub to your local machine.
5.  `docker rmi`: If you want to remove an existing image from your local machine, you can use the `docker rmi` command followed by the image ID or repository name. This command helps you clean up unused or outdated images.

#### Example

```console
# To add the "latest" tag to the Python FastAPI application image, you can use
$ docker tag my-fastapi-app my-fastapi-app:latest

# This command lists all the Docker images present on your local machine. 
# It displays the repository, tag, image ID, creation date, and size of each image.
$ docker images
REPOSITORY            TAG         IMAGE ID       CREATED       SIZE
myjenkins-blueocean   2.387.3-1   3eb5689ff763   6 days ago    790MB
my-fastapi-app        latest      67cdycd99743   2 hours ago   150MB
docker                dind        85cdec499643   8 days ago    323MB
postgres              latest      f14b0d96cff9   2 weeks ago   379MB
vault                 latest      1fa9c3f0708d   4 weeks ago   186MB

# This command fetches the latest version of the nginx image from the Docker Hub registry. 
# It downloads the image to your local machine.
$ docker pull nginx:latest
latest: Pulling from library/nginx
f03b40093957: Pull complete
eed12bbd6494: Pull complete
fa7eb8c8eee8: Pull complete
7ff3b2b12318: Pull complete
0f67c7de5f2c: Pull complete
831f51541d38: Pull complete
Digest: sha256:af296b188c7b7df99ba960ca614439c99cb7cf252ed7bbc23e90cfda59092305
Status: Downloaded newer image for nginx:latest
docker.io/library/nginx:latest

# This command pushes a local Docker image to a remote registry, making it available for others to use. 
# The output includes information about the pushed image, such as the digest and size.
$ docker push debakarr/myjenkins-blueocean:latest
The push refers to repository [docker.io/debakarr/myjenkins-blueocean]
ebe100ea75f2: Pushed
aa20ea415e9b: Pushed
dd7368f0b1ad: Pushed
6a2689aa4ed2: Pushed
9dfe2887b847: Pushed
ddabbb0c670a: Mounted from jenkins/jenkins
e2cf45412e4b: Mounted from jenkins/jenkins
12e639a5a7ea: Mounted from jenkins/jenkins
ba66619e71de: Mounted from jenkins/jenkins
d90c97aff719: Mounted from jenkins/jenkins
67ac8a362561: Mounted from jenkins/jenkins
6a45b66c291b: Mounted from jenkins/jenkins
56b018284c58: Mounted from jenkins/jenkins
7b8f9d0c670c: Mounted from jenkins/jenkins
3811da883895: Mounted from jenkins/jenkins
7de19ea2fded: Mounted from jenkins/jenkins
3fb287e008f8: Mounted from jenkins/jenkins
ae56c0c5405b: Mounted from jenkins/jenkins
latest: digest: sha256:97ce065841e7e33ac746396a46c4ef5865a772c2bd5b5651aa96b83951148f00 size: 4092

# This command removes a specified Docker image from your local machine. 
# The output confirms the successful removal of the image.
$ docker rmi nginx
Untagged: nginx:latest
Untagged: nginx@sha256:af296b188c7b7df99ba960ca614439c99cb7cf252ed7bbc23e90cfda59092305
Deleted: sha256:f9c14fe76d502861ba0939bc3189e642c02e257f06f4c0214b1f8ca329326cda
Deleted: sha256:419f8948c50c723f2a5ac74428af3d804b5d0079d6df8f7f827663cf10cbc366
Deleted: sha256:1030aac4f1a8096ed58d3d4a2df55dd1b1b27d919ad156d97ad1f68081d0051a
Deleted: sha256:7d90b49d96c3036539ef144ecc27c01de03902d8ea166a0f7b77d11d3779c4bd
Deleted: sha256:551acb210764654af31b6cd51adaa74edc9a202587c3395fe0e9f95a2e097f8b
Deleted: sha256:3c530958db4c75c6fb409f339367aaf9a1e163c84718c035d4b09bebc83f43e7
Deleted: sha256:8cbe4b54fa88d8fc0198ea0cc3a5432aea41573e6a0ee26eca8c79f9fbfa40e3
```

Reference:

-   [Image-building best practices](https://docs.docker.com/get-started/09_image_best/)
-   [Layer Caching](https://docs.docker.com/build/cache/)
-   [Image Layering](https://docs.docker.com/storage/storagedriver/)
-   [Multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
-   [docker tag](https://docs.docker.com/engine/reference/commandline/tag/)
-   [docker images](https://docs.docker.com/engine/reference/commandline/images/)
-   [docker push](https://docs.docker.com/engine/reference/commandline/push/)
-   [docker pull](https://docs.docker.com/engine/reference/commandline/pull/)
-   [docker rmi](https://docs.docker.com/engine/reference/commandline/rmi/)
