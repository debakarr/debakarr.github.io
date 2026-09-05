---
title: "Building a Restful API using JAX-RS"
date: "2017-09-27"
description: "Build a Book-catalog REST API with JAX-RS (Jersey) on Tomcat and test it with Postman, from project setup to GET, POST, PUT, and DELETE."
categories: ["Programming", "Web Development", "API"]
tags: ["RESTful", "API", "JAX-RS", "Java", "Tutorial", "Web Development"]
draft: false
---

![](https://upload.wikimedia.org/wikipedia/en/8/85/GlassFish_logo.svg)

[1\. What are the tools needed?](#tools)

[2\. Basic setup](#setup)

[3\. Setting up Tomcat Server and Postman](#tomcatAndPostman)

[4\. Structure](#structure)

[5\. Book Model](#bookModel)

[6\. Book Database](#database)

[7\. Book Services](#bookServices)

[8\. Book Resource](#bookResource)

[9\. GET](#get)

[10\. POST](#post)

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

Now you need to enter your project details. Mine are:

Group Id: org.debakar.bakadigest Artifact Id: bookDatabase

This will create a package **org.debakar.bakadigest.bookDatabase** where your resource files are stored.

The very first thing you need to do is open up your project and double-click pom.xml. Now switch to the pom.xml tab and uncomment the moxy dependency. This will let you produce JSON data. This is the same place where you can add the jersey dependency after creating a Maven Project using the maven archetype.

```
<dependency>
            <groupId>org.glassfish.jersey.media</groupId>
            <artifactId>jersey-media-moxy</artifactId>
</dependency>
```

Postman doesn’t need any particular steps to install. You just install it like any other application, or add the Chrome app if you are using Chrome.

Here’s the project structure:

*[Screenshot of the Eclipse project structure — original image link is dead]*

*[Screenshot of the Book model class — original image link is dead]*

*[Screenshot of the Book database class — original image link is dead]*

**NOTE**: This is not a great way to do it for business purposes.

*[Screenshot of the Book service class — original image link is dead]*

*[Screenshot of the Book resource class — original image link is dead]*

*[Screenshot of testing GET in Postman — original image link is dead]*

*[Screenshot of testing POST in Postman — original image link is dead]*

*[Screenshot of testing PUT, DELETE, and query endpoints in Postman — original image link is dead]*
