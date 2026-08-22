---
title: "Day 23: Terraform - Writing and applying configuration files"
date: "2023-05-11"
description: "Content Part 1: Introduction to DevOps Day 1: Understanding DevOps, its principles, and benefits Day 2: Exploring the DevOps lifecycle and its stages Day 3: Introduction to Continuous Integration (CI) and Continuous Deployment (CD) Day 4: Familiarizing with common DevOps tools and technologies Day 5: Studying DevOps culture and best practices Part 2: Version Control Systems Day 6: Introduction to Git Day 7: Basic Git commands (git init, git add, git commit, git status) Day 8: Branching and merging in Git Day 9: Remote repositories and collaboration with Git Day 10: Git workflows and best practices Part 3: Continuous Integration and Continuous Deployment (CI/CD)"
categories: ["DevOps", "Software Development", "Automation", "Infrastructure", "IaC", "Terraform"]
tags: ["DevOps", "CI/CD", "IaC", "Terraform"]
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
> -   **[Day 23: Terraform - Writing and applying configuration files](/posts/devops/day23-devops)**
> -   Day 24: Terraform - Modules and best practices
> -   Day 25: CloudFormation (AWS) - Overview and comparison
> 
> **Part 6: Containerization**
> 
> -   Day 26: Introduction to containerization
> -   Day 27: Docker - Installation and configuration
> -   Day 28: Docker - Building and managing images
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

Terraform configuration files are usually written in HCL (Hashicorp configuration Language) syntax. Although we can also write it in JSON. But it is recommended to write it in HCL as all the documentation is written in HCL and also it is a bit easier to read than JSON. The file extension is usaually *.tf*.

A Terraform configuration file usually include resource definition, variable definition, data source and other infrastructure components. Here is an example for a nginx docker container in a main.tf file.

```tf
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0.1"
    }
  }
}

provider "docker" {}

resource "docker_image" "nginx" {
  name         = "nginx"
  keep_locally = false
}

resource "docker_container" "nginx" {
  image = docker_image.nginx.image_id
  name  = "tutorial-debakarr"

  ports {
    internal = 80
    external = 8000
  }
}
```

This example is from the official site. You will usually use these `terraform` commands:

-   `terraform init`: Initializes the working directory, which includes downloading and installing any required providers and creating the backend configuration.
-   `terraform validate`: Validates the configuration files in a directory.
-   `terraform plan`: Creates an execution plan to reach a desired state of the infrastructure.
-   `terraform apply`: Makes the changes in the infrastructure as defined in the plan.
-   `terraform destroy`: Deletes all the old infrastructure resources.

When you execute the Terraform commands (`terraform init`, `terraform validate`, `terraform plan`, `terraform apply`, and `terraform destroy`) on the provided `main.tf` file, the following actions take place:

1.  `terraform init`:
    
    -   Initializes the working directory and sets up the necessary backend configuration.
    -   Downloads and installs the required provider, which is the Docker provider in this case (`kreuzwerker/docker` version `~> 3.0.1`).
2.  `terraform validate`:
    
    -   Validates the configuration files (`main.tf`) for syntax errors and other issues.
    -   Ensures that the configuration is valid and can be processed by Terraform.
3.  `terraform plan`:
    
    -   Creates an execution plan by analyzing the current state and the desired state specified in the configuration.
    -   Determines what actions need to be taken to reach the desired state.
    -   In this case, it will analyze that a Docker image and container need to be created.
4.  `terraform apply`:
    
    -   Executes the actions defined in the plan created by `terraform plan`.
    -   It provisions and manages the Docker resources defined in the configuration.
    -   Downloads the specified Docker image (`nginx`) and creates a container based on that image.
    -   Maps port 80 from the container to port 8000 externally.
5.  `terraform destroy`:
    
    -   Deletes the resources that were created by Terraform.
    -   In this case, it will delete the Docker container and image that were previously created.
    -   This command helps in cleaning up the infrastructure resources when they are no longer needed or to start fresh.

![](https://i.imgur.com/6HqrttK.png)

```console
debakarr@debakarr-mobl MINGW64 /c/Source/tf-demo/docker
$ terraform init

Initializing the backend...

Initializing provider plugins...
- Reusing previous version of kreuzwerker/docker from the dependency lock file
- Using previously-installed kreuzwerker/docker v3.0.2

Terraform has been successfully initialized!

You may now begin working with Terraform. Try running "terraform plan" to see
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.

debakarr@debakarr-mobl MINGW64 /c/Source/tf-demo/docker
$ terraform validate
Success! The configuration is valid.


debakarr@debakarr-mobl MINGW64 /c/Source/tf-demo/docker
$ terraform plan

Terraform used the selected providers to generate the following execution plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # docker_container.nginx will be created
  + resource "docker_container" "nginx" {
      + attach                                      = false
      + bridge                                      = (known after apply)
      + command                                     = (known after apply)
      + container_logs                              = (known after apply)
      + container_read_refresh_timeout_milliseconds = 15000
      + entrypoint                                  = (known after apply)
      + env                                         = (known after apply)
      + exit_code                                   = (known after apply)
      + hostname                                    = (known after apply)
      + id                                          = (known after apply)
      + image                                       = (known after apply)
      + init                                        = (known after apply)
      + ipc_mode                                    = (known after apply)
      + log_driver                                  = (known after apply)
      + logs                                        = false
      + must_run                                    = true
      + name                                        = "tutorial-debakarr"
      + network_data                                = (known after apply)
      + read_only                                   = false
      + remove_volumes                              = true
      + restart                                     = "no"
      + rm                                          = false
      + runtime                                     = (known after apply)
      + security_opts                               = (known after apply)
      + shm_size                                    = (known after apply)
      + start                                       = true
      + stdin_open                                  = false
      + stop_signal                                 = (known after apply)
      + stop_timeout                                = (known after apply)
      + tty                                         = false
      + wait                                        = false
      + wait_timeout                                = 60

      + ports {
          + external = 8000
          + internal = 80
          + ip       = "0.0.0.0"
          + protocol = "tcp"
        }
    }

  # docker_image.nginx will be created
  + resource "docker_image" "nginx" {
      + id           = (known after apply)
      + image_id     = (known after apply)
      + keep_locally = false
      + name         = "nginx"
      + repo_digest  = (known after apply)
    }

Plan: 2 to add, 0 to change, 0 to destroy.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── 

Note: You didn't use the -out option to save this plan, so Terraform can't guarantee to take exactly these actions if you run "terraform apply" now.   

debakarr@debakarr-mobl MINGW64 /c/Source/tf-demo/docker
$ terraform apply

Terraform used the selected providers to generate the following execution plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # docker_container.nginx will be created
  + resource "docker_container" "nginx" {
      + attach                                      = false
      + bridge                                      = (known after apply)
      + command                                     = (known after apply)
      + container_logs                              = (known after apply)
      + container_read_refresh_timeout_milliseconds = 15000
      + entrypoint                                  = (known after apply)
      + env                                         = (known after apply)
      + exit_code                                   = (known after apply)
      + hostname                                    = (known after apply)
      + id                                          = (known after apply)
      + image                                       = (known after apply)
      + init                                        = (known after apply)
      + ipc_mode                                    = (known after apply)
      + log_driver                                  = (known after apply)
      + logs                                        = false
      + must_run                                    = true
      + name                                        = "tutorial-debakarr"
      + network_data                                = (known after apply)
      + read_only                                   = false
      + remove_volumes                              = true
      + restart                                     = "no"
      + rm                                          = false
      + runtime                                     = (known after apply)
      + security_opts                               = (known after apply)
      + shm_size                                    = (known after apply)
      + start                                       = true
      + stdin_open                                  = false
      + stop_signal                                 = (known after apply)
      + stop_timeout                                = (known after apply)
      + tty                                         = false
      + wait                                        = false
      + wait_timeout                                = 60

      + ports {
          + external = 8000
          + internal = 80
          + ip       = "0.0.0.0"
          + protocol = "tcp"
        }
    }

  # docker_image.nginx will be created
  + resource "docker_image" "nginx" {
      + id           = (known after apply)
      + image_id     = (known after apply)
      + keep_locally = false
      + name         = "nginx"
      + repo_digest  = (known after apply)
    }

Plan: 2 to add, 0 to change, 0 to destroy.

Do you want to perform these actions?
  Terraform will perform the actions described above.
  Only 'yes' will be accepted to approve.

  Enter a value: yes

docker_image.nginx: Creating...
docker_image.nginx: Still creating... [10s elapsed]
docker_image.nginx: Creation complete after 15s [id=sha256:f9c14fe76d502861ba0939bc3189e642c02e257f06f4c0214b1f8ca329326cdanginx]
docker_container.nginx: Creating...
docker_container.nginx: Creation complete after 1s [id=cc21cf92096bfacf02419d197ab96be41d131e3c568bba1457800c598e80e914]

Apply complete! Resources: 2 added, 0 changed, 0 destroyed.

debakarr@debakarr-mobl MINGW64 /c/Source/tf-demo/docker
$ terraform destroy
docker_image.nginx: Refreshing state... [id=sha256:f9c14fe76d502861ba0939bc3189e642c02e257f06f4c0214b1f8ca329326cdanginx]
docker_container.nginx: Refreshing state... [id=cc21cf92096bfacf02419d197ab96be41d131e3c568bba1457800c598e80e914]

Terraform used the selected providers to generate the following execution plan. Resource actions are indicated with the following symbols:
  - destroy

Terraform will perform the following actions:

  # docker_container.nginx will be destroyed
  - resource "docker_container" "nginx" {
      - attach                                      = false -> null
      - command                                     = [
          - "nginx",
          - "-g",
          - "daemon off;",
        ] -> null
      - container_read_refresh_timeout_milliseconds = 15000 -> null
      - cpu_shares                                  = 0 -> null
      - dns                                         = [] -> null
      - dns_opts                                    = [] -> null
      - dns_search                                  = [] -> null
      - entrypoint                                  = [
          - "/docker-entrypoint.sh",
        ] -> null
      - env                                         = [] -> null
      - group_add                                   = [] -> null
      - hostname                                    = "cc21cf92096b" -> null
      - id                                          = "cc21cf92096bfacf02419d197ab96be41d131e3c568bba1457800c598e80e914" -> null
      - image                                       = "sha256:f9c14fe76d502861ba0939bc3189e642c02e257f06f4c0214b1f8ca329326cda" -> null
      - init                                        = false -> null
      - ipc_mode                                    = "private" -> null
      - log_driver                                  = "json-file" -> null
      - log_opts                                    = {} -> null
      - logs                                        = false -> null
      - max_retry_count                             = 0 -> null
      - memory                                      = 0 -> null
      - memory_swap                                 = 0 -> null
      - must_run                                    = true -> null
      - name                                        = "tutorial-debakarr" -> null
      - network_data                                = [
          - {
              - gateway                   = "172.17.0.1"
              - global_ipv6_address       = ""
              - global_ipv6_prefix_length = 0
              - ip_address                = "172.17.0.3"
              - ip_prefix_length          = 16
              - ipv6_gateway              = ""
              - mac_address               = "02:42:ac:11:00:03"
              - network_name              = "bridge"
            },
        ] -> null
      - network_mode                                = "default" -> null
      - privileged                                  = false -> null
      - publish_all_ports                           = false -> null
      - read_only                                   = false -> null
      - remove_volumes                              = true -> null
      - restart                                     = "no" -> null
      - rm                                          = false -> null
      - runtime                                     = "runc" -> null
      - security_opts                               = [] -> null
      - shm_size                                    = 64 -> null
      - start                                       = true -> null
      - stdin_open                                  = false -> null
      - stop_signal                                 = "SIGQUIT" -> null
      - stop_timeout                                = 0 -> null
      - storage_opts                                = {} -> null
      - sysctls                                     = {} -> null
      - tmpfs                                       = {} -> null
      - tty                                         = false -> null
      - wait                                        = false -> null
      - wait_timeout                                = 60 -> null

      - ports {
          - external = 8000 -> null
          - internal = 80 -> null
          - ip       = "0.0.0.0" -> null
          - protocol = "tcp" -> null
        }
    }

  # docker_image.nginx will be destroyed
  - resource "docker_image" "nginx" {
      - id           = "sha256:f9c14fe76d502861ba0939bc3189e642c02e257f06f4c0214b1f8ca329326cdanginx" -> null
      - image_id     = "sha256:f9c14fe76d502861ba0939bc3189e642c02e257f06f4c0214b1f8ca329326cda" -> null
      - keep_locally = false -> null
      - name         = "nginx" -> null
      - repo_digest  = "nginx@sha256:af296b188c7b7df99ba960ca614439c99cb7cf252ed7bbc23e90cfda59092305" -> null
    }

Plan: 0 to add, 0 to change, 2 to destroy.

Do you really want to destroy all resources?
  Terraform will destroy all your managed infrastructure, as shown above.
  There is no undo. Only 'yes' will be accepted to confirm.

  Enter a value: yes

docker_container.nginx: Destroying... [id=cc21cf92096bfacf02419d197ab96be41d131e3c568bba1457800c598e80e914]
docker_container.nginx: Destruction complete after 0s
docker_image.nginx: Destroying... [id=sha256:f9c14fe76d502861ba0939bc3189e642c02e257f06f4c0214b1f8ca329326cdanginx]
docker_image.nginx: Destruction complete after 1s

Destroy complete! Resources: 2 destroyed.
```
