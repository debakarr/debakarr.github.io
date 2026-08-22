---
title: "Day 8: Branching and merging in Git"
date: "2023-04-25"
description: "Content Part 1: Introduction to DevOps Day 1: Understanding DevOps, its principles, and benefits Day 2: Exploring the DevOps lifecycle and its stages Day 3: Introduction to Continuous Integration (CI) and Continuous Deployment (CD) Day 4: Familiarizing with common DevOps tools and technologies Day 5: Studying DevOps culture and best practices Part 2: Version Control Systems Day 6: Introduction to Git Day 7: Basic Git commands (git init, git add, git commit, git status) Day 8: Branching and merging in Git Day 9: Remote repositories and collaboration with Git Day 10: Git workflows and best practices Part 3: Continuous Integration and Continuous Deployment (CI/CD)"
categories: ["DevOps", "Software Development", "Automation", "Infrastructure", "Git"]
tags: ["DevOps", "Git", "GitHub", "Tutorial", "How-to", "Branching", "Merging"]
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
> -   **[Day 8: Branching and merging in Git](/posts/devops/day8-devops)**
> -   Day 9: Remote repositories and collaboration with Git
> -   Day 10: Git workflows and best practices
> 
> **Part 3: Continuous Integration and Continuous Deployment (CI/CD)**
> 
> -   Day 11: Introduction to CI/CD
> -   Day 12: Jenkins - Installation and configuration
> -   Day 13: Jenkins - Creating and managing jobs
> -   Day 14: Jenkins - Integrating with Git
> -   Day 15: Jenkins - Pipelines and best practices
> 
> **Part 4: Configuration Management**
> 
> -   Day 16: Introduction to configuration management
> -   Day 17: Ansible - Installation and configuration
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

Resource I refered:

-   [Git - Basic Branching and Merging](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging)
-   [Git Merge | Atlassian Git Tutorial](https://www.atlassian.com/git/tutorials/using-branches/git-merge)

---

Branching and merging are essential features in Git that allow developers to work on multiple features or bug fixes simultaneously without affecting the main codebase. Git is a version control system that allows you to keep track of changes to your codebase and collaborate with other developers.

Git’s branching feature allows you to create a new branch and make changes to the codebase without affecting the main branch. This feature is particularly useful when working on new features or bug fixes that are not yet ready for the main codebase. To create a new branch, use the command:

```console
git checkout -b new-feature
```

This command will create a new branch named `new-feature`, and you can start making changes to the codebase in this branch. You can create as many branches as you need for your project.

Once you have made the necessary changes to your codebase in the new branch, you can merge your changes back into the main branch. This can be done using the following commands:

```console
# Add all your changes
git add .

# Commit all of your changes
git commit -m "Commit message"

# Checkout to the branch where you want to merge the changes
git checkout main

# Merge the changes from the feature branch
git merge new-feature
```

This will merge the changes you made in the `new-feature` branch back into the `main` branch. If there are any merge conflicts, Git will prompt you to resolve them.

After merging your changes, you can delete the feature branch using the command:

```console
git branch -d new-feature
```

This will delete the `new-feature` branch, and your changes will now be part of the `main` branch.

In conclusion, branching and merging are essential features in Git that allow developers to work on multiple features or bug fixes simultaneously without affecting the main codebase. By using Git’s branching and merging features, you can keep your codebase organized and collaborate with other developers efficiently.
