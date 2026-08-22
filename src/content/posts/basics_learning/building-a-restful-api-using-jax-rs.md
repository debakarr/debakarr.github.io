---
title: "Building a Restful API using JAX-RS"
date: "2017-09-27"
description: "1. What are the tools needed? 2. Basic setup 3. Setting up Tomcat Server and Postman 4. Structure 5. Book Model 6. Book Database 7. Book Services 8. Book Resource 9. GET 10. PUSH 11. PUT 12. DELETE 13. Query -Get Book(s) by title -Get Book(s) by subject ID Another thing we are going to use is called Postman. Postman is an HTTP Request composer. It helps you test your API in a very efficient way."
categories: ["Programming", "Web Development", "API"]
tags: ["RESTful", "API", "JAX-RS", "Java", "Tutorial", "Web Development"]
draft: false
---

![](https://upload.wikimedia.org/wikipedia/en/thumb/8/85/GlassFish_logo.svg/1200px-GlassFish_logo.svg.png)

[1\. What are the tools needed?](#tools)

[2\. Basic setup](#setup)

[3\. Setting up Tomcat Server and Postman](#tomcatAndPostman)

[4\. Structure](#structure)

[5\. Book Model](#bookModel)

[6\. Book Database](#database)

[7\. Book Services](#bookServices)

[8\. Book Resource](#bookResource)

[9\. GET](#get)

[10\. PUSH](#push)

[11\. PUT](#put)

[12\. DELETE](#delete)

[13\. Query](#query)

      -[Get Book(s) by title](#title)

      -[Get Book(s) by subject ID](#subjectId)

Another thing we are going to use is called Postman. Postman is an HTTP Request composer. It helps you test your API in a very efficient way. You can download Postman from [here](https://www.getpostman.com/apps).

Fill in the following data

**Archetype Artifact Id**: jersey-quickstart-webapp

**Archetype Version**: 2.16

**Alternatively** you can add the following dependency after creating your Maven Project.

```
<!-- https://mvnrepository.com/artifact/org.glassfish.jersey.archetypes/jersey-quickstart-webapp -->
<dependency>
    <groupId>org.glassfish.jersey.archetypes</groupId>
    <artifactId>jersey-quickstart-webapp</artifactId>
    <version>2.16</version>
</dependency>
```

Now next you need to type your project detail. Mine is:

Group Id: org.debakar.bakadigest Artifact Id: bookDatabase

This will create a package **org.debakar.bakadigest.bookDatabase** where your resource files are stored.

The very first thing you need to do is open up your project and double-click pom.xml. Now head to pom.xml tab and uncomment moxy dependency. This will let you produce JSON data. This is the same place where you can add jersey dependency after creating a Maven Project using maven archetype.

```
<dependency>
            <groupId>org.glassfish.jersey.media</groupId>
            <artifactId>jersey-media-moxy</artifactId>
</dependency>
```

And for Postman does need any particular step to install. You just need to install it basically as you install other application or add the chrome app available if you are using chrome.

Here’s the project structure:

![](https://goo.gl/4kznJW)

![](https://goo.gl/wvK8HF)

![](https://goo.gl/Y4ZoiS)

**NOTE**: This is not a great way when you do it for business purpose.

![](https://goo.gl/huAXcn)

![](https://goo.gl/2YvoRN)

![](https://goo.gl/WjpKkS)

![](https://goo.gl/Yzgmj6)

![](https://goo.gl/4gs3d1)
