---
title: "Day18: Ansible - Ad-hoc commands and playbooks"
date: "2023-05-06"
description: "Content Part 1: Introduction to DevOps Day 1: Understanding DevOps, its principles, and benefits Day 2: Exploring the DevOps lifecycle and its stages Day 3: Introduction to Continuous Integration (CI) and Continuous Deployment (CD) Day 4: Familiarizing with common DevOps tools and technologies Day 5: Studying DevOps culture and best practices Part 2: Version Control Systems Day 6: Introduction to Git Day 7: Basic Git commands (git init, git add, git commit, git status) Day 8: Branching and merging in Git Day 9: Remote repositories and collaboration with Git Day 10: Git workflows and best practices Part 3: Continuous Integration and Continuous Deployment (CI/CD)"
categories: ["DevOps", "Software Development", "Automation", "Infrastructure", "Ansible"]
tags: ["DevOps", "CI/CD", "Jenkins", "Tutorial", "Ansible", "Playbook", "Ad-hoc command"]
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
> -   **[Day 18: Ansible - Ad-hoc commands and playbook](/posts/devops/day18-devops)**
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

## Introduction:

Ansible is a powerful automation tool that simplifies complex tasks in IT environments. In this blog post, we will explore Ansible ad-hoc commands and playbooks. Ad-hoc commands are a quick way to execute simple tasks on remote hosts, while playbooks allow you to create reusable and more complex automation workflows.

## Setup

I had setup 1 Ubuntu ansible controller and 3 Debian ansible host machine.

![](https://i.imgur.com/SPBcnvv.png)

### Ansible Ad-hoc commands

Ad-hoc commands are a great way to perform quick tasks on your remote hosts without the need for a playbook. These commands are executed directly from the command line and are useful for simple tasks like checking the status of a service or creating a new user.

---

Here are some examples of Ansible ad-hoc commands:

#### Check if linux host are reachable

```console
ansible linux-host -m ping
```

![](https://i.imgur.com/m0Nndbs.png)

---

#### Check uptime of all the linux host

```console
ansible linux-host -m command -a "uptime"
```

![](https://i.imgur.com/LIdBX0u.png)

---

#### Use `ansible/builtin.shell` module

```console
ansible linux-host -m ansible.builtin.shell -a 'echo $TERM'
```

![](https://i.imgur.com/vvGEDlR.png)

---

#### Use `ansible.builtin.copy` module

```console
ansible linux-host -m ansible.builtin.copy -a "src=/etc/hosts dest=/tmp/hosts"
```

![](https://i.imgur.com/udlo1Tl.png)

---

Keep in mind that ad-hoc commands are not suitable for complex tasks, and their usage should be limited to simple and quick tasks.

---

### Ansible Playbook

Playbooks are the core of Ansible’s automation capabilities. They are written in YAML and define a series of tasks to be executed on remote hosts. Playbooks can be easily shared, reused, and versioned, making them ideal for more complex tasks and workflows.

Here’s a simple example of an Ansible playbook that installs and configures the Apache web server on multiple Debian hosts under the “linux-host” group:

```yaml
---
- name: Install and configure Apache on Debian hosts
  hosts: linux-host
  become: yes

  tasks:
    - name: Update package index
      apt:
        update_cache: yes

    - name: Install Apache
      apt:
        name: apache2
        state: present

    - name: Start and enable Apache service
      service:
        name: apache2
        state: started
        enabled: yes

  handlers:
    - name: Restart Apache
      service:
        name: apache2
        state: restarted
```

![](https://i.imgur.com/N9kF0E7.png)

In this playbook, we first update the package index on all hosts in the “linux-host” group. Then, we install the Apache web server using the apt module. Finally, we start and enable the Apache service, and create a handler to restart the service if any changes are made.

To run this playbook, save it as apache\_setup.yml and execute the following command:

```console
ansible-playbook apache_setup.yml
```

This playbook will install and configure the Apache web server on all Debian hosts in the “linux-host” group.

---

### Conclusion

In this blog post, we have explored Ansible ad-hoc commands and playbooks. Ad-hoc commands are useful for quick and simple tasks, while playbooks provide a more powerful and reusable way to automate complex tasks and workflows.

As you continue to learn and use Ansible, you’ll find that these tools can greatly simplify your IT automation tasks and improve your overall workflow.

---

Few more resources one can read:

-   [Introduction to ad hoc commands](https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html)
-   [CI/CD concepts](https://www.middlewareinventory.com/blog/ansible-ad-hoc-commands/)
-   [How to install software packages with an Ansible playbook](https://www.redhat.com/sysadmin/software-packages-ansible)
