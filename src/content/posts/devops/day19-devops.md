---
title: "Day 19: Ansible - Roles and best practices"
date: "2023-05-07"
description: "Content Part 1: Introduction to DevOps Day 1: Understanding DevOps, its principles, and benefits Day 2: Exploring the DevOps lifecycle and its stages Day 3: Introduction to Continuous Integration (CI) and Continuous Deployment (CD) Day 4: Familiarizing with common DevOps tools and technologies Day 5: Studying DevOps culture and best practices Part 2: Version Control Systems Day 6: Introduction to Git Day 7: Basic Git commands (git init, git add, git commit, git status) Day 8: Branching and merging in Git Day 9: Remote repositories and collaboration with Git Day 10: Git workflows and best practices Part 3: Continuous Integration and Continuous Deployment (CI/CD)"
categories: ["DevOps", "Software Development", "Automation", "Infrastructure", "Ansible", "Best Pactice"]
tags: ["DevOps", "CI/CD", "Jenkins", "Tutorial", "Ansible", "Ansible-Galaxy", "Ansible Roles", "Best Pactice"]
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
> -   **[Day 19: Ansible - Roles and best practices](/posts/devops/day19-devops)**
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

👋 In this blog post, we will explore Ansible roles, their benefits, and how to use them in your playbooks. We’ll also discuss best practices for organizing and structuring your Ansible projects.

### Ansible Roles: Basics and Creating

Ansible roles provide a well-defined structure for organizing your tasks, variables, handlers, metadata, templates, and other files. They allow you to reuse and share your Ansible code efficiently across multiple projects without duplicating the code. This makes your projects more manageable and easier to maintain.

A simple example of using roles in a playbook can be found in the official Ansible documentation:

```yaml
---
- hosts: webservers
  roles:
    - common
    - webservers
```

In this example, the common and webservers roles are applied to the webservers group of hosts.

---

### Sharing Roles with Ansible Galaxy

Ansible Galaxy is a public repository for sharing and discovering Ansible roles created by the community. You can search and download roles that fit your use case, saving time and leveraging the expertise of other users.

For example, to install a PostgreSQL server role from Ansible Galaxy, you can run:

```console
$ ansible-galaxy install geerlingguy.postgresql
Starting galaxy role install process
- downloading role 'postgresql', owned by geerlingguy
- downloading role from https://github.com/geerlingguy/ansible-role-postgresql/archive/3.4.3.tar.gz
- extracting geerlingguy.postgresql to /home/debakarr/.ansible/roles/geerlingguy.postgresql
- geerlingguy.postgresql (3.4.3) was installed successfully
```

And then use it in a playbook:

```yaml
---
- hosts: linux-host
  become: true
  roles:
    - role: geerlingguy.postgresql
      vars:
        postgresql_users:
          - name: debakarr
```

![](https://i.imgur.com/JoaGuno.png)

---

For best practices you can follow these resources:

-   [Ansible Best Practices](https://github.com/jkupferer/ansible-best-practices)
-   [Ansible Best practices](https://github.com/DemisR/ansible_best_practices_slides/)
-   [Ansible Best Practices to Follow \[Tips & Tricks\]](https://spacelift.io/blog/ansible-best-practices)
