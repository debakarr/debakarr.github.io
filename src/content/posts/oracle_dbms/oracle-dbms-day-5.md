---
title: "[Training] DBMS with Oracle Day 5"
date: "2017-07-27"
description: "This time I am a bit late. Actually, my college started so it took me some time to write-up my next blog post. Anyways, today we are going to have a look at PL/SQL Cursor, Procedure, Function, and Trigger. This will complete the very basics of PL/SQL. So what is cursor? Cursor is a pointer to a memory area called context area(Actually it is a pointer to a row). Whenever you use SELECT or any DML (INSERT, DELETE, UPDATE or MERGE) then cursor holds the rows (one or more) returned by a SQL statement."
categories: ["Database Management", "Programming"]
tags: ["Oracle", "DBMS", "Database", "SQL", "Tutorial", "Day 5"]
draft: false
---

![](http://i.imgur.com/7l7BvWT.png)

This time I am a bit late. Actually, my college started so it took me some time to write-up my next blog post. Anyways, today we are going to have a look at **PL/SQL** **`Cursor, Procedure, Function, and Trigger`**. This will complete the very basics of PL/SQL.

**So what is cursor?**

**`Cursor`** is a pointer to a memory area called context area(Actually it is a pointer to a row). Whenever you use **`SELECT`** or any **`DML`** (**`INSERT, DELETE, UPDATE or MERGE`**) then cursor holds the rows (one or more) returned by a SQL statement.

There are two types of cursors:

-   **Implicit cursors**
    
-   **Explicit cursors**
    

**Implicit cursors**: It is automatically created by the Oracle server every time an SQL DML statement is executed and the user cannot control the behavior of these cursors.

Example:

```
SET SERVEROUTPUT ON;

BEGIN

UPDATE PRODUCT

SET P_NAME='WAIWAI' 

WHERE P_NAME LIKE ('FULL%');

DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT);

END;
```

Here the output will be number of rows affected by the **`UPDATE`** (DML) statement.

**Explicit cursors**: Explicit cursors, unlike implicit cursor, are user defined cursors. The user has to create these cursors for any statement which basically returns one or more row of data. Here the user has full control of the cursor. It is worth noting that an explicit cursor has to be named in the declaration section of the PL/SQL block.

Here’s an example:

```
SET SERVEROUTPUT ON;

Declare

CURSOR CURS_product IS

SELECT P_ID,P_NAME, P_QTY FROM PRODUCT;

V_RECORD CURS_product%ROWTYPE;

BEGIN

    OPEN CURS_product;

    LOOP

        FETCH CURS_product INTO V_RECORD;

        EXIT WHEN CURS_product%NOTFOUND;

        DBMS_OUTPUT.PUT_LINE('PRODUCT NAME: ' || V_RECORD.P_NAME || chr(9) || ', PRODUCT ID: ' || V_RECORD.P_ID || ', PRODUCT QUANTITY: ' || V_RECORD.P_QTY);

    END LOOP;

    CLOSE CURS_product;

END;
```

So now you know what is a cursor and how to use implicit and explicit cursor. I would recommend you to look to the over the internet for more information on cursor.

**Now lets talk about procedure and function**

Just like other languages here in **PL/SQL** too a **`function`** is a set of statements which finally return something to the caller. Similarly a **`procedure`** too is a set of statement but it does not return anything. These two can save us time as we don’t have to rewrite the same long code again and again.

Let me provide you the syntax for both first.

```
--Syntax for function



CREATE [OR REPLACE] FUNCTION function_name

(Parameter 1, Parameter 2…)

RETURN datatype

IS

Declare variable, constant etc. here. 

BEGIN

Executable Statements

Return (Return Value);

END;

 /

 --Syntax for procedure

 

CREATE [OR REPLACE] PROCEDURE procedure_name

    [ (parameter [,parameter]) ]

IS

    [declaration_section]

BEGIN

    executable_section

[EXCEPTION

    exception_section]

END [procedure_name];
```

Here’s an example of update product quantity in **`product`** tableeverytime someone purchased something i.e. data/row is added to the **`sales`** table:

```
create or replace PROCEDURE PROD_PRODUCTS

(PRO_ID NUMBER, PRO_QTY NUMBER , CUS_ID NUMBER, EMP_ID NUMBER, PRO_DATE DATE)

   AS

BEGIN 

INSERT INTO SALES(C_ID, E_ID, P_ID, PUR_QTY, PUR_DATE)

VALUES(CUS_ID , EMP_ID, PRO_ID, PRO_QTY, PRO_DATE);

UPDATE PRODUCT SET P_QTY = 

((SELECT P_QTY FROM PRODUCT WHERE P_ID = PRO_ID) - PRO_QTY)WHERE P_ID = PRO_ID;

END;

/

EXEC PROD_PRODUCTS ( 10001, 2, 10000001, 100001, TO_DATE('18-JUL-2017', 'DD-MON-YYYY'))
```

Similarly we can have a function to return number of bills count in a particular day from **`sales`** table.

```
create FUNCTION FUNC_BILLS

(P_DATE DATE) RETURN NUMBER

AS

V_BILLCOUNT NUMBER;

BEGIN

SELECT COUNT(*) INTO V_BILLCOUNT

FROM SALES WHERE PUR_DATE = P_DATE;

RETURN V_BILLCOUNT;

END;

/

SET SERVEROUTPUT ON; 

DECLARE 

V_DATE DATE := TO_DATE('&E_DATE', 'DD-MON-YYYY');

V_NUM NUMBER;

BEGIN

V_NUM := FUNC_BILLS(V_DATE);

DBMS_OUTPUT.PUT_LINE(V_NUM);

END;
```

So now we know about cursor, procedure, and function. So that left us with our last topic, trigger.

**What are trigger?**'

Triggers are named PL/SQL blocks which automatically execute or fire whenever some event occur. In sence of PL/SQL lets say we want to call a function whenever a data is insert in sales table then we can use trigger for that. I basically use trigger to share the YouTube video I like to Facebook which save me time to click on share button and do the next necessary steps.

The basic syntax for a trigger is:

```
CREATE [OR REPLACE] TRIGGER Ttrigger_name

{BEFORE|AFTER} Triggering_event ON table_name

[FOR EACH ROW]

[FOLLOWS another_trigger_name]

[ENABLE/DISABLE]

[WHEN condition]

DECLARE

declaration statements

BEGIN

executable statements

EXCEPTION

exception-handling statements

END;
```

Here’s an example of a trigger which notifies you whenever you insert any new row to product table.

```
 CREATE OR REPLACE TRIGGER TRIG_PRODUCT

AFTER INSERT ON PRODUCT

FOR EACH ROW

ENABLE

DECLARE

BEGIN

DBMS_OUTPUT.PUT_LINE('You Just Inserted a new row in Product ');

END;
```

There are many ways to use trigger. This is just a very basic example I have provided. Trigger can also be use to assign ID to a primary key which works as an AUTO\_INCREMENT alternative for mySQL (We have to use sequence as well as trigger to do so). Basically I have just given you a gist of what we can do with PL/SQL and there is far more thing to learn.

So this is the end of my blog post on DBMS with Oracle. Our training is about 5 days and to be honest we really learned a lot from this training. Oracle has a vast amount query that is still unknown to me. Though it is very important to know the basics of Oracle database as it is used by many Big companies out there as their DBMS. So this is all for today. I will keep on bringing blog like this, to tell you all the basic in shortest way possible. Thank you for reading and see you next time.
