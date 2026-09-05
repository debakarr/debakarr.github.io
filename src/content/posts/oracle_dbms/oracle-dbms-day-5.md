---
title: "[Training] DBMS with Oracle Day 5"
date: "2017-07-27"
description: "Day 5 of an Oracle DBMS training: PL/SQL cursors, procedures, functions, and triggers."
categories: ["Database Management", "Programming"]
tags: ["Oracle", "DBMS", "Database", "SQL", "Tutorial", "Day 5"]
draft: false
---

![](http://i.imgur.com/7l7BvWT.png)

This time I am a bit late. My college started, actually, so it took me some time to write up my next blog post. Anyways, today we are going to look at **PL/SQL** **`cursors, procedures, functions, and triggers`**. This will complete the very basics of PL/SQL.

**So what is a cursor?**

A **`cursor`** is a pointer to a memory area called the context area (actually, it is a pointer to a row). Whenever you use **`SELECT`** or any **`DML`** (**`INSERT, DELETE, UPDATE or MERGE`**), the cursor holds the rows (one or more) returned by the SQL statement.

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

Here the output will be the number of rows affected by the **`UPDATE`** (DML) statement.

**Explicit cursors**: unlike implicit cursors, explicit cursors are user-defined. The user creates these cursors for any statement that returns one or more rows of data. Here the user has full control over the cursor. Note that an explicit cursor must be named in the declaration section of the PL/SQL block.

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

So now you know what a cursor is and how to use implicit and explicit cursors. I would recommend looking over the material available on the internet for more information on cursors.

**Now let’s talk about procedures and functions**

Just like in other languages, here in **PL/SQL** a **`function`** is a set of statements which finally returns something to the caller. Similarly, a **`procedure`** is a set of statements, but it does not return anything. These two save us time, as we don’t have to rewrite the same long code again and again.

First, here is the syntax for both.

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

Here’s an example that updates the product quantity in the **`product`** table every time someone makes a purchase, i.e. whenever a row is added to the **`sales`** table:

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

Similarly, we can have a function that returns the number of bills in the **`sales`** table for a particular day.

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

So now we know about cursors, procedures, and functions. That leaves us with our last topic: triggers.

**What are triggers?**

Triggers are named PL/SQL blocks which automatically execute (fire) whenever some event occurs. In terms of PL/SQL, let’s say we want to call a function whenever a row is inserted into the SALES table — we can use a trigger for that. (I use a similar trigger to share the YouTube videos I like to Facebook, which saves me the time of clicking the share button and doing the next necessary steps.)

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

Here’s an example of a trigger which notifies you whenever you insert a new row into the PRODUCT table.

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

There are many ways to use triggers. This is just a very basic example. Triggers can also be used to assign IDs to primary keys, which works as an AUTO_INCREMENT alternative for MySQL (we have to use a sequence as well as a trigger to do so). I have basically just given you a gist of what we can do with PL/SQL — there is far more to learn.

So this is the end of my blog post on DBMS with Oracle. Our training lasted about 5 days and, to be honest, we learned a lot from it. Oracle has a vast number of queries still unknown to me, though knowing the basics of the Oracle database is very important, as it is used by many big companies as their DBMS. That’s all for today. I will keep bringing blogs like this to explain the basics in the shortest way possible. Thank you for reading, and see you next time.
