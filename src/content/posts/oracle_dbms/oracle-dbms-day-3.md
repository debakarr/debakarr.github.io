---
title: "[Training] DBMS with Oracle Day 3"
date: "2017-07-20"
description: "Day 3 of an Oracle DBMS training: schemas, CREATE and ALTER TABLE, primary and foreign keys, DELETE, DROP, TRUNCATE, and built-in functions."
categories: ["Database Management", "Programming"]
tags: ["Oracle", "DBMS", "Database", "SQL", "Tutorial", "Day 3"]
draft: false
---

![](http://i.imgur.com/vJoCZWa.png)

So in this blog we are basically going to cover the things done on the second day of my Oracle DBMS training. Although I am not going to use the same schema I used during the 2nd day of my training.

So without further delay, let’s dig in.

First things first. **What is a schema?**

This is something I should have mentioned in the first blog. In general, a schema is a set of **tables, stored procedures, and other objects that make up a whole database**. In Oracle, a user owns all the tables and other objects that together constitute a database, and hence in Oracle **a user can be considered a schema**. This might sound a bit tough right now, but it will become totally clear as you start working with objects other than tables.

Before starting, let me tell you how to write comments in Oracle SQL.

For a single-line comment we use **`--`**, and for a multi-line comment we start with **`/*`**, write our comment, and end it with **`*/**.

Now there are various SQL queries we need to know about. Let’s look at the first query.

**The very first query is `CREATE TABLE`**

I might be repeating this but it’s pretty much an essential query among the many other queries.

```
--Syntax:

CREATE TABLE <TABLENAME>

(COLUMN1 DESCRIPTION, 

COLUMN2 DESCRIPTION, 

....);
```

Here **`DESCRIPTION`** contains the data type and if possible the key identifier.

**Now second query is `ALTER TABLE`**

There are plenty of things you can do with `ALTER TABLE`. Here are a few:

```
--Syntax to rename a table



ALTER TABLE  old_name_of_table  RENAME TO  new_name_of_table;



--Syntax to add a column to an existing table



ALTER TABLE  existing_table_name  ADD  new_column_name  data_type (size);



--NOTE: Note here we don't write 'COLUMN' after key word ADD.



--Syntax to rename a column of a table.



ALTER TABLE  table_name  RENAME COLUMN old_name_of_column TO  new_name_of_column;



--Syntax to modify the column definition using ALTER TABLE.



ALTER TABLE  table_name  MODIFY  column_name  data_type (size);
```

These are few things we can do with `ALTER TABLE` command. There are other things too.

**Now to see the structure of a particular table you can use `DESC`**

```
Syntax:

DESC <TABLENAME>
```

**Now let’s talk about Primary Key constraints.**

A **Primary Key constraint** is basically a combination of **`NOT NULL`** and **`UNIQUE`**. If a column is a primary key in a table, then each row has a unique value in that column.

So how to define a primary key?

We can define a primary key at the time of creation of our table.

```
--Example 

CREATE TABLE PRODUCT

 (

  Product_id  NUMBER(5)  PRIMARY KEY,

  Product_name  VARCHAR2(30),

  Product_price  NUMBER(5)

 );
```

Here Product\_id is a primary key. Apart from this, we can also make a primary key as follows:

```
CREATE TABLE PRODUCT 

 (

  Product_id   NUMBER(3)   CONSTRAINT   promstr_col1_pid_pk   PRIMARY KEY,

  Product_name   VARCHAR2(30),

  Product_price   NUMBER(5)

 );
```

Both of the above used queries can be referred as **`column level definition`**.

Apart from this there is one last method I want to mention, which is the **`table level definition`** of a primary key. Here is a small example:

```
CREATE TABLE product_master

 (

  Product_id  NUMBER(3), 

  Product_name  VARCHAR2(30),

  Product_price  NUMBER(5),

  CONSTRAINT promstr_col1_pid_pk PRIMARY KEY (product_id)

  );
```

\*\*So why do we use the other two methods when we can directly make a column as primary key? \*\*

Basically a primary key is a constraint on a column, and giving a constraint its own name is good practice. It keeps the column and constraint names distinct, and the naming fits perfectly.

You can have a primary key spanning more than one column, which is known as a **`composite key`**.

Here is an example of defining a composite key:

```
CREATE TABLE customer

 (

  cust_id NUMBER(3),

  cust_name VARCHAR2(3),

  phone_no NUMBER(10),

  CONSTRAINT cust_cid_pk PRIMARY KEY ( cust_id, phone_no)

 );
```

This was your first constraint definition, and that’s why I explained each method separately. From now on I will focus on syntax more than examples. Also, I was going to attach a document at the end of the post containing all the syntax with detailed examples provided by Rahul sir (the link has since died — see the note at the end).

After the primary key we have the `foreign key`. If your table holds the primary key of another table (basically what happens when you make a child table of a parent table), then the child table’s column linking it to the parent table is called a foreign key.

NOTE: The main purpose of the foreign key is very logical. `A father is always born before his child`. So basically you have to define your parent table before the child table, to make sure that the foreign key in the child table exists as a primary key in the parent table.

```
--Syntax  

Column_name	  Datatype(size)   REFERENCES   parent_table_name (parent_column_name)
```

So the thing you should wonder now is: what happens if a row in the parent table gets deleted while its primary key is a foreign key in the child table? Shouldn’t the child table’s rows get deleted too? Wait… in reality (**sorry, I don’t mean it**) when a father dies, does his child die too? No.

Don’t take my father-child analogy as the base concept for SQL databases. There might be other parent-child relationships where losing the parent means losing the child too.

That’s why we have two options here: either **`ON DELETE SET NULL`** or **`ON DELETE CASCADE`**.

Let’s consider an Author-Book relationship.

**Now here’s how we do `On Delete Set Null`**

```
--Parent table: Authors



CREATE TABLE author

 (

  author_id  NUMBER(3)  CONSTRAINT  athr_aid_pk  PRIMARY KEY,

  author_name  VARCHAR2(30)

 );



--Child table: Books



CREATE TABLE books

 (

  book_id  NUMBER(3),

  book_title  VARCHAR2(30),

  book_price  NUMBER(3),

  book_author_id  NUMBER(3)  CONSTRAINT  bok_ai_fk  REFERENCES  author(author_id)  ON DELETE SET NULL

 );
```

This will set the value of foreign key null when a primary key in parent table is gone.

**Now here’s how we use `On Delete Cascade`**

```
CREATE TABLE author

 (

  author_id  NUMBER(3)  CONSTRAINT  athr_aid_pk  PRIMARY KEY,

  author_name  VARCHAR2(30)

 );



CREATE TABLE books

 (

   book_id  NUMBER(3),

   book_title  VARCHAR2(30),

   book_price  NUMBER(3),

   book_author_id  NUMBER(3)  CONSTRAINT  bok_ai_fk  REFERENCES  author(author_id)     ON DELETE CASCADE

 );
```

This will remove every row from the child table whose foreign key points to the deleted parent-table row.

‘Remove’ is not the right term when working with SQL. When data is removed, it is deleted, which is done with the DELETE keyword.

Here’s the syntax:

```
DELETE FROM table <WHERE conditions>;
```

**If you want to delete the whole table at once you can use `drop` keyword.**

Syntax is something like this:

```
DROP TABLE <TABLENAME> <CASCADE CONSTRAINTS> <PURGE>;
```

The **`PURGE`** keyword removes it from the **`tablespace`**. The analogy here is that when you delete something, it goes to the recycle bin (unless you deleted it permanently); emptying the recycle bin means you cannot get it back. Same case here: once deleted from the tablespace, the data cannot be retrieved.

Now if you want to delete all data from a table without deleting the table itself, you can use **`TRUNCATE`**.

```
--Syntax:

TRUNCATE TABLE <TABLENAME>;
```

Apart from this there are other clauses too: **`UNION`, `JOIN`, `INTERSECT`**, etc.

**The document attached with this post contains everything in detail.**

Lastly we have various functions. Basically we have 5 types of functions:

-   \*\*Character, \*\*
    
-   **Number,**
    
-   **General,**
    
-   **Conversion** and
    
-   **Date.**
    

There are two types of Character Function:

-   **Case manipulation function**
    
-   **Character Manipulation functions.**
    

In Oracle Database we have three Case Manipulation functions and seven Character Manipulation functions.

**The three Case Manipulation functions are:**

-   Lower()
    
-   upper() and
    
-   initcap()
    

**and the seven Character Manipulation functions are:**

-   concat(),
    
-   substr(),
    
-   length(),
    
-   instr(),
    
-   lpad()/rpad(),
    
-   trim () and
    
-   replace().
    

**Number functions include:** ABS, ACOS, ASIN, ATAN, ATAN2, BITAND, CEIL, COS, COSH, EXP, FLOOR, LN, LOG, MOD, NANVL, POWER, REMAINDER, ROUND, SIGN, SIN, SINH, SQRT, TAN, TANH, TRUNC, and WIDTH_BUCKET.
    

After all this, one may still wonder: is there a better way than executing one query at a time? Yes, and that is **PL/SQL**. In my next blog, I am going to talk about **PL/SQL** and how to use it to run more than one query at a time, declare and initialize data, and use loops, conditions, cases, etc. So there is a lot more to cover. I am also thinking of making a tips post with a few shortcuts for things like… let me think… deleting all tables at once, splitting SQL statements (no PL/SQL, just plain SQL), and much more.

Thank you for reading. Hope you like it.

And don’t forget to download the reference document with all the basic SQL commands explained with examples.

*Note: the document originally attached here is no longer available (the link is dead, so it was removed).*
