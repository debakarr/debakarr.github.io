---
title: "Day 29: Docker - Running and managing containers"
date: "2023-05-17"
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
> -   [Day 28: Docker - Building and managing images](/posts/devops/day28-devops)
> -   **[Day 29: Docker - Running and managing containers](/posts/devops/day29-devops)**
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

Containers are lightweight, isolated environments that encapsulate applications, making them portable and easy to deploy. Docker provides powerful tools and commands to run, monitor, and manage containers efficiently. So, let’s explore how to unleash the full potential of Docker containers.

### Running docker container

To run a Docker container, you need a Docker image as a blueprint. If you already have an image, you can use the `docker run` command to start a container based on that image. If the image is not available locally, it will be pulled first and then we run the container. Let’s take a look at an example:

```console
$ docker run -d -p 8080:80 --name my-nginx nginx:latest
Unable to find image 'nginx:latest' locally
latest: Pulling from library/nginx
f03b40093957: Pull complete
eed12bbd6494: Pull complete
fa7eb8c8eee8: Pull complete
7ff3b2b12318: Pull complete
0f67c7de5f2c: Pull complete
831f51541d38: Pull complete
Digest: sha256:af296b188c7b7df99ba960ca614439c99cb7cf252ed7bbc23e90cfda59092305
Status: Downloaded newer image for nginx:latest
d90a8f6684b2e0820878bbd575d553e82f3976c61ff593ad7fa93f1538c7ef40
```

-   We use the `-d` flag to run the container in detached mode, which means it will run in the background.
-   The `-p` flag is used to publish port 80 of the container to port 8080 on the host machine. This allows accessing the Nginx web server running inside the container through `http://localhost:8080`.
-   The `--name` flag assigns a name to the container, in this case, `my-nginx`.
-   We specify the image to use as `nginx:latest`, which pulls the latest version of the Nginx image from the Docker Hub registry.

### Managing Docker Containers

Once you have your containers up and running, you’ll want to manage and monitor them effectively. Docker provides several commands to help you accomplish this:

1.  `docker ps`: This command lists all the running containers on your system, displaying details such as the container ID, image used, status, ports, and names.
    
2.  `docker stop <container>`: Use this command to gracefully stop a running container. Replace `<container>` with either the container ID or the container name.
    
3.  `docker start <container>`: This command starts a stopped container. Again, replace `<container>` with the container ID or name.
    
4.  `docker restart <container>`: If you need to restart a running container, you can use this command. It stops the container and starts it again.
    
5.  `docker logs <container>`: To view the logs of a specific container, use this command. It displays the output and logs generated by the container’s processes.
    
6.  `docker exec -it <container> <command>`: This command allows you to execute a command inside a running container. Use the `-it` flags to open an interactive terminal session. Replace `<container>` with the container ID or name, and `<command>` with the desired command.
    
7.  `docker rm <container>`: If you want to remove a stopped container, you can use this command. It permanently deletes the container. Again, replace `<container>` with the container ID or name.
    

#### Example

```console
# Run the Nginx container in detached mode, mapping port 7400 on the host to port 80 in the container
$ docker run -d -p 7400:80 --name my-nginx nginx:latest
786cddb4675284e38479da5592f03179ffeea651e1423f38db832cf86a3eccac

# List the running containers
$ docker ps
CONTAINER ID   IMAGE                           COMMAND                  CREATED         STATUS         PORTS                                              NAMES
786cddb46752   nginx:latest                    "/docker-entrypoint.…"   7 seconds ago   Up 3 seconds   0.0.0.0:7400->80/tcp                               my-nginx
ac4d4ba5db97   postgres:latest                 "docker-entrypoint.s…"   6 days ago      Up 6 hours     0.0.0.0:5432->5432/tcp                             postgres
f76dc8e0a2ae   docker:dind                     "dockerd-entrypoint.…"   6 days ago      Up 6 hours     2375/tcp, 0.0.0.0:2376->2376/tcp                   jenkins-docker
e676b19a399b   myjenkins-blueocean:2.387.3-1   "/usr/bin/tini -- /u…"   6 days ago      Up 6 hours     0.0.0.0:8080->8080/tcp, 0.0.0.0:50000->50000/tcp   jenkins-blueocean

# Stop the my-nginx container
$ docker stop my-nginx
my-nginx

# List the running containers (my-nginx is stopped, so it doesn't shows up)
$ docker ps
CONTAINER ID   IMAGE                           COMMAND                  CREATED      STATUS       PORTS                                              NAMES
ac4d4ba5db97   postgres:latest                 "docker-entrypoint.s…"   6 days ago   Up 6 hours   0.0.0.0:5432->5432/tcp                             postgres
f76dc8e0a2ae   docker:dind                     "dockerd-entrypoint.…"   6 days ago   Up 6 hours   2375/tcp, 0.0.0.0:2376->2376/tcp                   jenkins-docker
e676b19a399b   myjenkins-blueocean:2.387.3-1   "/usr/bin/tini -- /u…"   6 days ago   Up 6 hours   0.0.0.0:8080->8080/tcp, 0.0.0.0:50000->50000/tcp   jenkins-blueocean

# List all containers (including stopped ones)
$ docker ps -a
CONTAINER ID   IMAGE                           COMMAND                  CREATED          STATUS                     PORTS                                              NAMES
786cddb46752   nginx:latest                    "/docker-entrypoint.…"   26 seconds ago   Exited (0) 9 seconds ago                                                      my-nginx
ac4d4ba5db97   postgres:latest                 "docker-entrypoint.s…"   6 days ago       Up 6 hours                 0.0.0.0:5432->5432/tcp                             postgres
f76dc8e0a2ae   docker:dind                     "dockerd-entrypoint.…"   6 days ago       Up 6 hours                 2375/tcp, 0.0.0.0:2376->2376/tcp                   jenkins-docker
e676b19a399b   myjenkins-blueocean:2.387.3-1   "/usr/bin/tini -- /u…"   6 days ago       Up 6 hours                 0.0.0.0:8080->8080/tcp, 0.0.0.0:50000->50000/tcp   jenkins-blueocean

# Start the my-nginx container
$ docker start my-nginx
my-nginx

# List the running containers
$ docker ps
CONTAINER ID   IMAGE                           COMMAND                  CREATED          STATUS         PORTS                                              NAMES
786cddb46752   nginx:latest                    "/docker-entrypoint.…"   38 seconds ago   Up 2 seconds   0.0.0.0:7400->80/tcp                               my-nginx
ac4d4ba5db97   postgres:latest                 "docker-entrypoint.s…"   6 days ago       Up 6 hours     0.0.0.0:5432->5432/tcp                             postgres
f76dc8e0a2ae   docker:dind                     "dockerd-entrypoint.…"   6 days ago       Up 6 hours     2375/tcp, 0.0.0.0:2376->2376/tcp                   jenkins-docker
e676b19a399b   myjenkins-blueocean:2.387.3-1   "/usr/bin/tini -- /u…"   6 days ago       Up 6 hours     0.0.0.0:8080->8080/tcp, 0.0.0.0:50000->50000/tcp   jenkins-blueocean

# Restart the my-nginx container
$ docker restart my-nginx
my-nginx

# View the logs of the my-nginx container
$ docker logs my-nginx
/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration
/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/
/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh
10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf
10-listen-on-ipv6-by-default.sh: info: Enabled listen on IPv6 in /etc/nginx/conf.d/default.conf
/docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh
/docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh
/docker-entrypoint.sh: Configuration complete; ready for start up
2023/05/28 12:53:11 [notice] 1#1: using the "epoll" event method
2023/05/28 12:53:11 [notice] 1#1: nginx/1.25.0
2023/05/28 12:53:11 [notice] 1#1: built by gcc 10.2.1 20210110 (Debian 10.2.1-6)
2023/05/28 12:53:11 [notice] 1#1: OS: Linux 5.15.90.1-microsoft-standard-WSL2
2023/05/28 12:53:11 [notice] 1#1: getrlimit(RLIMIT_NOFILE): 1048576:1048576
2023/05/28 12:53:11 [notice] 1#1: start worker processes
2023/05/28 12:53:11 [notice] 1#1: start worker process 28
2023/05/28 12:53:11 [notice] 1#1: start worker process 29
2023/05/28 12:53:11 [notice] 1#1: start worker process 30
2023/05/28 12:53:22 [notice] 1#1: signal 3 (SIGQUIT) received, shutting down
2023/05/28 12:53:22 [notice] 28#28: gracefully shutting down
2023/05/28 12:53:22 [notice] 28#28: exiting
2023/05/28 12:53:22 [notice] 28#28: exit
2023/05/28 12:53:22 [notice] 29#29: gracefully shutting down
2023/05/28 12:53:22 [notice] 29#29: exiting
2023/05/28 12:53:22 [notice] 29#29: exit
2023/05/28 12:53:22 [notice] 30#30: gracefully shutting down
2023/05/28 12:53:22 [notice] 30#30: exiting
2023/05/28 12:53:22 [notice] 30#30: exit
2023/05/28 12:53:23 [notice] 1#1: signal 17 (SIGCHLD) received from 28
2023/05/28 12:53:23 [notice] 1#1: worker process 28 exited with code 0
2023/05/28 12:53:23 [notice] 1#1: signal 29 (SIGIO) received
2023/05/28 12:53:23 [notice] 1#1: signal 17 (SIGCHLD) received from 30
2023/05/28 12:53:23 [notice] 1#1: worker process 30 exited with code 0
2023/05/28 12:53:23 [notice] 1#1: signal 29 (SIGIO) received
2023/05/28 12:53:23 [notice] 1#1: signal 17 (SIGCHLD) received from 29
2023/05/28 12:53:23 [notice] 1#1: worker process 29 exited with code 0
2023/05/28 12:53:23 [notice] 1#1: exit
/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration
/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/
/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh
10-listen-on-ipv6-by-default.sh: info: IPv6 listen already enabled
/docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh
/docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh
/docker-entrypoint.sh: Configuration complete; ready for start up
2023/05/28 12:53:42 [notice] 1#1: using the "epoll" event method
2023/05/28 12:53:42 [notice] 1#1: nginx/1.25.0
2023/05/28 12:53:42 [notice] 1#1: built by gcc 10.2.1 20210110 (Debian 10.2.1-6)
2023/05/28 12:53:42 [notice] 1#1: OS: Linux 5.15.90.1-microsoft-standard-WSL2
2023/05/28 12:53:42 [notice] 1#1: getrlimit(RLIMIT_NOFILE): 1048576:1048576
2023/05/28 12:53:42 [notice] 1#1: start worker processes
2023/05/28 12:53:42 [notice] 1#1: start worker process 22
2023/05/28 12:53:42 [notice] 1#1: start worker process 23
2023/05/28 12:53:42 [notice] 1#1: start worker process 24
2023/05/28 12:53:53 [notice] 1#1: signal 3 (SIGQUIT) received, shutting down
2023/05/28 12:53:53 [notice] 23#23: gracefully shutting down
2023/05/28 12:53:53 [notice] 22#22: gracefully shutting down
2023/05/28 12:53:53 [notice] 22#22: exiting
2023/05/28 12:53:53 [notice] 23#23: exiting
2023/05/28 12:53:53 [notice] 22#22: exit
2023/05/28 12:53:53 [notice] 23#23: exit
2023/05/28 12:53:53 [notice] 24#24: gracefully shutting down
2023/05/28 12:53:53 [notice] 24#24: exiting
2023/05/28 12:53:53 [notice] 24#24: exit
2023/05/28 12:53:54 [notice] 1#1: signal 17 (SIGCHLD) received from 22
2023/05/28 12:53:54 [notice] 1#1: worker process 22 exited with code 0
2023/05/28 12:53:54 [notice] 1#1: signal 29 (SIGIO) received
2023/05/28 12:53:54 [notice] 1#1: signal 17 (SIGCHLD) received from 23
2023/05/28 12:53:54 [notice] 1#1: worker process 23 exited with code 0
2023/05/28 12:53:54 [notice] 1#1: signal 29 (SIGIO) received
2023/05/28 12:53:54 [notice] 1#1: signal 17 (SIGCHLD) received from 24
2023/05/28 12:53:54 [notice] 1#1: worker process 24 exited with code 0
2023/05/28 12:53:54 [notice] 1#1: exit
/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration
/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/
/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh
10-listen-on-ipv6-by-default.sh: info: IPv6 listen already enabled
/docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh
/docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh
/docker-entrypoint.sh: Configuration complete; ready for start up
2023/05/28 12:54:01 [notice] 1#1: using the "epoll" event method
2023/05/28 12:54:01 [notice] 1#1: nginx/1.25.0
2023/05/28 12:54:01 [notice] 1#1: built by gcc 10.2.1 20210110 (Debian 10.2.1-6)
2023/05/28 12:54:01 [notice] 1#1: OS: Linux 5.15.90.1-microsoft-standard-WSL2
2023/05/28 12:54:01 [notice] 1#1: getrlimit(RLIMIT_NOFILE): 1048576:1048576
2023/05/28 12:54:01 [notice] 1#1: start worker processes
2023/05/28 12:54:01 [notice] 1#1: start worker process 22
2023/05/28 12:54:01 [notice] 1#1: start worker process 23
2023/05/28 12:54:01 [notice] 1#1: start worker process 24

# Access the shell of the my-nginx container
$ docker exec -it my-nginx /bin/bash
root@786cddb46752:/# curl localhost:80
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
html { color-scheme: light dark; }
body { width: 35em; margin: 0 auto;
font-family: Tahoma, Verdana, Arial, sans-serif; }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>
root@786cddb46752:/# exit
exit

# Attempting to remove a running container (my-nginx) results in an error because the container is still running. It needs to be stopped before removal.
$ docker rm my-nginx
Error response from daemon: You cannot remove a running container 786cddb4675284e38479da5592f03179ffeea651e1423f38db832cf86a3eccac. Stop the container before attempting removal or force remove

# Stop my-nginx container
$ docker stop my-nginx
my-nginx

# Now remove works
$ docker rm my-nginx
my-nginx

# We don't see my-nginx container anymore
$ docker ps -a
CONTAINER ID   IMAGE                           COMMAND                  CREATED      STATUS       PORTS                                              NAMES
ac4d4ba5db97   postgres:latest                 "docker-entrypoint.s…"   6 days ago   Up 6 hours   0.0.0.0:5432->5432/tcp                             postgres
f76dc8e0a2ae   docker:dind                     "dockerd-entrypoint.…"   6 days ago   Up 6 hours   2375/tcp, 0.0.0.0:2376->2376/tcp                   jenkins-docker
e676b19a399b   myjenkins-blueocean:2.387.3-1   "/usr/bin/tini -- /u…"   6 days ago   Up 6 hours   0.0.0.0:8080->8080/tcp, 0.0.0.0:50000->50000/tcp   jenkins-blueocean
```

Reference:

-   [docker run](https://docs.docker.com/engine/reference/run/)
-   [docker ps](https://docs.docker.com/engine/reference/commandline/ps/)
-   [docker stop](https://docs.docker.com/engine/reference/commandline/stop/)
-   [docker start](https://docs.docker.com/engine/reference/commandline/start/)
-   [docker restart](https://docs.docker.com/engine/reference/commandline/restart/)
-   [docker logs](https://docs.docker.com/engine/reference/commandline/logs/)
-   [docker exec](https://docs.docker.com/engine/reference/commandline/exec/)
-   [docker rm](https://docs.docker.com/engine/reference/commandline/rm/)
