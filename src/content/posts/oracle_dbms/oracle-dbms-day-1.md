---
title: "[Training] DBMS with Oracle Day 1"
date: "2017-07-18"
description: "Day 1 of an Oracle DBMS training: what databases are, users and privileges, creating tables and keys, and ER diagrams."
categories: ["Database Management", "Programming"]
tags: ["Oracle", "DBMS", "Database", "SQL", "Tutorial", "Day 1"]
draft: false
---

![](http://i.imgur.com/bDVJGg3.png)

In this post, I am going to wrap up all the things I learned during my first class on ‘DBMS with Oracle’. The training lecture is given by ‘**Rahul Sohal**’, CTO & Resource Management Lead of [iandwe.in](https://secure.iandwe.in/).

**So first of all what is database?**

A **database** is a collection of information kept in an organized way, for ease of retrieval.

Facebook has its own database. Think about yesterday, when you logged into your account and liked all those posts, shared certain stuff, and commented on a picture. All these things are stored in a database, and when you log into your account today, all this information is retrieved from the database.

\*\*Next, we were taught what the so-called DBMS is.\*\*

Because we are Computer Science students, we were familiar with the term. We have actually used **DBMS** software like **MySQL** and **Microsoft Access**. A DBMS stands for ‘**Database Management System**’. Basically it’s system software for creating as well as managing databases. It provides a way for a programmer/user to create, retrieve, update, and manipulate data in different ways.

So we are going to learn **DBMS with Oracle**. As most of us have used MySQL, Rahul sir asked us the difference between MySQL and Oracle DBMS. I had not worked on Oracle DBMS before, but I somewhat knew that Oracle DBMS is used for more complex queries than MySQL. In addition, it supports far more joins than MySQL, which only supports a 61-join limit (I know these things because I have used MySQL for managing the database of my own website at some point, though I never had to use any complex queries). Then Rahul sir told us that Oracle is used for ‘**Enterprise Business Applications**’ in big companies, whereas MySQL is used by small companies as it is somewhat easier to use.

\*\*Next: how are data processed between client and server?\*\*

From client side, we send a request with the help of SQL(Structured Query Language). Then the server returns a tuple on the successful execution of SQL statement. The server is generally hosted on 127.0.0.1:8080. Here 127.0.0.1 is IP and is basically called localhost and 8080 is the port which can be changed during installation of the Oracle DBMS.

The data is generally organized as a **table** containing **rows** and **columns**. Here’s a basic example:

| ROLL | NAME |
| --- | --- |
| 1 | Rahul |
| 2 | Baka |
| 3 | Debakar |

Here the table contains Roll and Name as attributes, and each row holds one record.

If we need to display data for roll no. 1 then the query for that is:

```
SELECT * FROM STUDENT WHERE ROLL = 1;
```

```
CONNECT / AS SYSDBA;
```

To create a user we have to type:

```
CREATE USER <USERNAME> IDENTIFIED BY <PASSWORD>;
```

Before jumping into creating tables, we need to grant some **privileges** to the newly created user. This is quite new to me, as in MySQL we can directly create a table after creating and selecting a database. In Oracle, we have to assign privileges to the user via SYSDBA. A few common privileges can be granted like this:

```
GRANT CONNECT TO <USERNAME>;
GRANT RESOURCE, DBA TO <USERNAME>;
GRANT CREATE SESSION TO <USERNAME>;
GRANT UNLIMITED TABLESPACE TO <USERNAME>;
```

After this we can connect to our user like this:

```
CONNECT
Enter user-name: your_user_name 
Enter password: your_password
```

Then we need to give privilege for the basic **DML(Data Manipulation Language)** commands. This can be done like this:

```
GRANT SELECT, INSERT, UPDATE, DELETE ON <TABLENAME> TO <USERNAME>;
```

But the above command only works after you have created a table. All this privilege handling is really what sets MySQL and Oracle apart. By now, one thing is clear to me: Oracle DBMS has far more features than MySQL.

```
CREATE TABLE STUDENT(ROLL NUMBER, NAME VARCHAR2(30), DOB DATE) ;
```

This takes us into a situation where we can talk about something called ‘**Data Redundancy**’. Rahul Sir told us that in the table we just created we can have as many rows as we want with the same data, which is nothing but a waste of space. The same data in different rows — data that is not useful at all — crams up all the space, and hence it is called ‘Data Redundancy’. He told us that it frequently happens when a beginner makes a form and, due to some internet issue, we as users end up submitting the form 10 times, so our data lands in the table 10 times, causing ‘Data Redundancy’. By now, I knew everything he was trying to explain, and believe me, I also knew that he was going to tell us about constraints next. Then he explained to us what **primary keys, composite keys, and unique keys** are.

Then after all this, we were told about **entities, relations, attributes, and most importantly ER diagrams** (here ER stands for **Entity Relationship**). To be honest, it is not my first time hearing all this, but I never bothered drawing ER diagrams before.

Then we were taught about ER diagrams in more depth. A few diagrams we came to know about are as follows:

*[Diagram of standard ER-diagram symbols: entities, attributes, relationships, and keys — original image link is dead]*

*[Example entity-relationship model diagram — original image link is dead]*

###### NOTE: These pictures are taken from the internet. Yep I did a little bit of research.

Rahul sir has also given us definitions of some basic terminology. This includes **Entity, Relationship, Keys, Super keys, and Candidate keys**.

Now we were shown relationships in ER diagrams, which more or less ends our day-1 training. We were given the problem of making an ‘**Employee Database**’.

Finally, as I have almost finished writing this blog and believe me, I am a beginner blogger. So writing up this blog took me a good amount of time. I ended up not doing any real stuff at home today. Still, I think I can make it up on tomorrow’s class. I will also try to wrap up tomorrow’s lecture in another upcoming blog post.
