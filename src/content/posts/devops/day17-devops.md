---
title: "Day 17: Ansible - Installation and configuration"
date: "2023-05-05"
description: "Content Part 1: Introduction to DevOps Day 1: Understanding DevOps, its principles, and benefits Day 2: Exploring the DevOps lifecycle and its stages Day 3: Introduction to Continuous Integration (CI) and Continuous Deployment (CD) Day 4: Familiarizing with common DevOps tools and technologies Day 5: Studying DevOps culture and best practices Part 2: Version Control Systems Day 6: Introduction to Git Day 7: Basic Git commands (git init, git add, git commit, git status) Day 8: Branching and merging in Git Day 9: Remote repositories and collaboration with Git Day 10: Git workflows and best practices Part 3: Continuous Integration and Continuous Deployment (CI/CD)"
categories: ["DevOps", "Software Development", "Automation", "Infrastructure", "Ansible"]
tags: ["DevOps", "CI/CD", "Jenkins", "Tutorial", "Ansible"]
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
> -   **[Day 17: Ansible - Installation and configuration](/posts/devops/day17-devops)**
> -   Day 18: Ansible - Ad-hoc commands and playbooks
> -   Day 19: Ansible - Roles and best practices
> -   Day 20: Puppet and Chef - Overview and comparison
> 
> **Part 5: Infrastructure as Code**
> 
> -   Day 21: Introduction to Infrastructure as Code (IaC)
> -   Day 22: Terraform - Installation and configuration
> -   Day 23: Terraform - Writing and applying configuration files
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

---

Ansible can only be installed in Linux system. Although we can connect Windows machine in Ansible inventory.

### Update System

#### Debian-Based System (Ubuntu, Debian)

```console
sudo apt-get update
sudo apt-get-upgrade
```

#### RHEL-Based system (CentOS, RGEL, Fedora)"

If you are using RHEL-Based system then the command will be

```console
sudo yum update
```

### Install Python

#### Debian-Based System (Ubuntu, Debian)

```console
sudo apt-get install python3
```

#### RHEL-Based system (CentOS, RGEL, Fedora)"

If you are using RHEL-Based system then the command will be

```console
sudo yum install python3
```

### Install Ansible

#### Debian-Based System (Ubuntu, Debian)

```console
sudo apt-get install ansible
```

#### RHEL-Based system (CentOS, RGEL, Fedora)"

If you are using RHEL-Based system then the command will be

```console
sudo yum install ansible
```

### Verify the version

```console
ansible --version
```

### Configure Ansible

Generally we will be modifying `/etc/ansible/ansible.cfg` file change/update any Ansible configuration. We can also add inventory file in `/etc/ansible` location. To start with we can add a file name hosts in the `/etc/ansible` folder. Content of the file may look something like this:

```yaml
[webserver]
192.168.1.0
196.168.1.11
```

And then update the `/etc/ansible/ansible.cfg` file:

```ini
inventory = /etc/ansible/hosts
```

Now ansible is installed and ready to use.
