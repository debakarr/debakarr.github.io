---
title: "[Training] DBMS with Oracle Day 3"
date: "2017-07-20"
description: "So in this blog basically we are going to cover up the things done by me on the second day of my Oracle DBMS Training. Although I am not going to use the same schema I used during the 2nd day of my training. So without further delay, lets dig in. First thing first. What is a schema? This is something I should have mentioned in the first blog. In general, a schema is a set of tables, sproc(stored procedure) and other objects that make up a whole database."
categories: ["Database Management", "Programming"]
tags: ["Oracle", "DBMS", "Database", "SQL", "Tutorial", "Day 3"]
draft: false
---

![](http://i.imgur.com/vJoCZWa.png)

So in this blog basically we are going to cover up the things done by me on the second day of my Oracle DBMS Training. Although I am not going to use the same schema I used during the 2nd day of my training.

So without further delay, lets dig in.

First thing first. **What is a schema?**

This is something I should have mentioned in the first blog. In general, a schema is a set of **tables, sproc(stored procedure) and other objects that make up a whole database**. Although in Oracle a user owned all the tables and other objects that together constitute a database and hence in Oracle **a user can be considered as a schema**. This might sound a bit tough right now but it will totally become clear as you start working with other objects, other than Table.

Before starting let me tell you how to write comments in Oracle SQL.

For a single line comment we use **`--`** and for a multi line comment we start with **`/*`** followed by our comment and the end it with **`*/`**.

Now there are various SQL queries we need to know about. Let’s see the first query.

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

There are plenty of things you can do with `ALTER TABLE`. Here are few

```
--Syntax to rename a table



ALTER TABLE  old_name_of_table  RENAME TO  new_name_of_table;



--Syntax to add a column to an existing table



ALTER TABLE  existing_table_name  ADD  new_column_name  data_type (size);



--NOTE: Note here we don't write 'COLUMN' after key word ADD.



--Syntax to rename a column of a table.



ALTER TABLE  table_name  RENAME COLUMN old_name_of_column TO  new_name_of_column;



--Syntax to modify the column definition using ALTER TABLE.



ALTER TABLE  table_name  MODIFY  colun_name  data_type (size);
```

These are few things we can do with `ALTER TABLE` command. There are other things too.

**Now to see the structure of a particular table you can use `DESC`**

```
Syntax:

DESC <TABLENAME>
```

**Now lets talk about Primary Key Constraint.**

A **Primary Key Constraint** basically is a combination of **`NOT NULL`** and **`UNIQUE`**. If a column is a primary key in that table then each row in that column have some unique value.

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

Apart from this there is one last method I want yo mention, which is **`table level definition`** of a primary key. Here is a small example:

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

Basically Primary key is a constraint to a column and and having a different name for a constraint is an efficient way to follow. This makes sure you have different name for column and constraint. And the naming also fits perfectly.

You can have more than one primary key too and when you have more than one primary key then it is know as **`composite key`**.

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

This was your first constraint definition and that’s why I explained each method separately. From now on I will only focus on the syntax more than examples. Also I am going to attach a document at the end of the post which contains all the syntax with proper detailed example provide by Rahul sir.

After primary key we have `foreign key`. If your table have primary key of any other table (basically it happens when you are making child class of a table), then your child table’s column which relates it with parent table with the is called a foreign key.

NOTE: The main purpose of foreign key is very logical. `Father always born before his child`. So basically you have to define your parent table before child table to make sure that the foreign key in child table exists as primary key in parent table.

```
--Syntax  

Column_name	  Datatype(size)   REFERENCES   parent_table_name (parent_column_name)
```

So the thing you should wonder now is what will happen if a row in parent child get deleted whose primary key is a foreign key in it’s child table. Shouldn’t it’s child table row also get deleted? Wait… In reality (**sorry I don’t mean it**) when a father died does his child die too? No.

Don’t take my father child analogy as the base concept for SQL Database. There might be other parent child relationship where when a parent is lost then it’s child is lost too.

That’s why we can have two things to do here. Either **`On Delete Set Null`** or **`On Delete Cascade`**

Lets consider a Author Book relationship.

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

This will remove each row from child table whose foreign key point to primary key of parent table row which got removed.

`remove` is not the right term when we are working with SQL. Here whenever a data is removed it being deleted. Which can be done using delete keyword.

Here’s the syntax:

```
DELETE FROM table <WHERE conditions>;
```

**If you want to delete the whole table at once you can use `drop` keyword.**

Syntax is something like this:

```
DROP TABLE <TABLENAME> <CASCADE CONSTRAINTS> <PURGE>;
```

The **`PURGE`** keyword remove it from the **`tablespace`**. Basically the analogy for this will be that any thing you delete something it went to the recycle bin(until and unless you permanently deleted it) deleting the data from recycle bin means you cannot retrieve it again. Same case here. One deleted from the tablespace the data cannot be retrieve back.

Now if you want to delete all data from the table without deleting the table, then you can use **`truncate`**.

```
--Syntax:

TRUNCATE TABLE <TABLENAME>;
```

Apart from this there are other things to which are **`UNION`, `JOIN`, `INTERSECT`** etc.

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
    
-   upper () and
    
-   incap()
    

\*\*and seven Character Manipulation functions functions are: \*\*

-   concat(),
    
-   substr(),
    
-   length(),
    
-   instr(),
    
-   lpad()/rpad(),
    
-   trim () and
    
-   replace().
    

**Number Function includes:**

-   ABS
    
-   ACOS
    
-   ASIN
    
-   ATAN
    
-   ATAN2
    
-   BITAND
    
-   CEIL
    
-   COS
    
-   COSH
    
-   EXP
    
-   FLOOR
    
-   LN
    
-   LOG
    
-   MOD
    
-   NANVL
    
-   POWER
    
-   REMAINDER
    
-   ROUND (number)
    
-   SIGN
    
-   SIN
    
-   SINH
    
-   SQRT
    
-   TAN
    
-   TANH
    
-   TRUNC (number)
    
-   WIDTH\_BUCKETABS
    
-   ACOS
    
-   ASIN
    
-   ATAN
    
-   ATAN2
    
-   BITAND
    
-   CEIL
    
-   COS
    
-   COSH
    
-   EXP
    
-   FLOOR
    
-   LN
    
-   LOG
    
-   MOD
    
-   NANVL
    
-   POWER
    
-   REMAINDER
    
-   ROUND (number)
    
-   SIGN
    
-   SIN
    
-   SINH
    
-   SQRT
    
-   TAN
    
-   TANH
    
-   TRUNC (number)
    
-   WIDTH\_BUCKET
    

After all this one will still wonder is there a better way to do more that executing one query at a time. Yes there is a better way and that is **PL/SQL**. In my next blog, I am going to talk about **PL/SQL** and how to use it to create more that one query at a time, define data and initialize them, use loop, condition, cases etc. So there a lot more to cover. I am also thinking of making a tip post where I will provide few shortcut methods to… let me think… delete all the table at once, separating SQL statement (no PL/SQL, just in simple SQL) and many more.

Thank you for reading. Hope you like it.

And don’t forget download this document for all the basic SQL commands explained with examples.

[](https://goo.gl/TqosEq)
