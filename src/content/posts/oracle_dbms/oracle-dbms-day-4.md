---
title: "[Training] DBMS with Oracle Day 4"
date: "2017-07-24"
description: "Day 4 of an Oracle DBMS training: PL/SQL blocks, variables, control flow, sequences, and views, built on a sample sales schema."
categories: ["Database Management", "Programming"]
tags: ["Oracle", "DBMS", "Database", "SQL", "Tutorial", "Day 4"]
draft: false
---

![](http://i.imgur.com/joyWfPr.png)

If you are reading this then I want to notify you that this is the 3rd part of the series of blog post I am writing up about basically **`DBMS with Oracle`**.

If you haven’t yet read my previous post then feel free to go to [this link](https://dibakarroy1997.github.io/BakaDigest/2017/07/18/oracle-dbms-day-1.html) for **part 1** and [this link](https://dibakarroy1997.github.io/BakaDigest/2017/07/20/oracle-dbms-day-3.html) for **part 2**.

Now today we are going to look at something called **PL/SQL** and also we will do some exercise to get a grip of PL/SQL.

**So first what is PL/SQL?**

**PL/SQL** stands for **`Procedural Language-Structured Query Language**`. It is also a case-insensitive programming language. In SQL we can execute one statement at a time, whereas in PL/SQL we can combine many SQL statements and execute them all at once.

PL/SQL follows a predefined syntax

### **ER Diagram**

I made it in a rush, so it might not be as good as it should have been.

![](http://i.imgur.com/30i1Ztb.png)

### **Relational Schema**

Trust me, it’s a correct diagram because I didn’t mess anything up and let SQL Developer handle it all.

![](http://i.imgur.com/3TUZhoJ.png)

**What we are going to do?**

Taking this **`schema`** as a base, we are going to create a few **`tables`**. I will just put up all the code to create the tables.

### BATCH

```
CREATE TABLE BATCH 

(

  B_ID NUMBER(4, 0) NOT NULL 

, MAF_DATE DATE NOT NULL 

, EXP_DATE DATE NOT NULL 

, B_QTY NUMBER NOT NULL 

, S_ID NUMBER(3, 0) NOT NULL 

, CONSTRAINT BATCH_PK PRIMARY KEY 

  (

    B_ID 

  )

);



ALTER TABLE BATCH

ADD CONSTRAINT BATCH_FK1 FOREIGN KEY

(

  S_ID 

)

REFERENCES SUPPLIER

(

  S_ID 

);
```

### CUSTOMER

```
CREATE TABLE CUSTOMER 

(

  C_ID NUMBER(8, 0) NOT NULL 

, C_NAME VARCHAR2(30 BYTE) NOT NULL 

, C_PHONE NUMBER NOT NULL 

, CONSTRAINT CUSTOMER_PK PRIMARY KEY 

  (

    C_ID 

  )

);
```

### EMPLOYEE

```
CREATE TABLE EMPLOYEE 

(

  E_ID NUMBER(6, 0) NOT NULL 

, COUNTER_NO NUMBER NOT NULL 

, E_PHONE NUMBER(10, 0) NOT NULL 

, E_NAME VARCHAR2(30 BYTE) NOT NULL 

, CONSTRAINT EMPLOYEE_PK PRIMARY KEY 

  (

    E_ID 

  )

);
```

### PRODUCT

```
CREATE TABLE PRODUCT 

(

  P_ID NUMBER(5, 0) NOT NULL 

, P_NAME VARCHAR2(100 BYTE) NOT NULL 

, P_PRICE NUMBER(9, 2) NOT NULL 

, B_ID NUMBER(4, 0) NOT NULL 

, P_QTY NUMBER NOT NULL 

, CONSTRAINT PRODUCT_PK PRIMARY KEY 

  (

    P_ID 

  )

);



ALTER TABLE PRODUCT

ADD CONSTRAINT PRODUCT_UK1 UNIQUE 

(

  B_ID 

);



ALTER TABLE PRODUCT

ADD CONSTRAINT PRODUCT_FK1 FOREIGN KEY

(

  B_ID 

)

REFERENCES BATCH

(

  B_ID 

);
```

### SALES

```
CREATE TABLE SALES 

(

  C_ID NUMBER(8, 0) NOT NULL 

, E_ID NUMBER(6, 0) NOT NULL 

, P_ID NUMBER(5, 0) NOT NULL 

, PUR_QTY NUMBER NOT NULL 

, PUR_DATE DATE NOT NULL 

);



ALTER TABLE SALES

ADD CONSTRAINT SALES_FK1 FOREIGN KEY

(

  C_ID 

)

REFERENCES CUSTOMER

(

  C_ID 

);



ALTER TABLE SALES

ADD CONSTRAINT SALES_FK3 FOREIGN KEY

(

  P_ID 

)

REFERENCES PRODUCT

(

  P_ID 

);
```

### SUPPLIER

```
CREATE TABLE SUPPLIER 

(

  S_ID NUMBER(3, 0) NOT NULL 

, S_NAME VARCHAR2(30 BYTE) NOT NULL 

, S_ADDRESS VARCHAR2(60 BYTE) NOT NULL 

, S_PHONE NUMBER(10, 0) NOT NULL 

, S_EMAIL VARCHAR2(30 BYTE) NOT NULL 

, CONSTRAINT SUPPLIER_PK PRIMARY KEY 

  (

    S_ID 

  )

);



ALTER TABLE SUPPLIER

ADD CONSTRAINT SUPPLIER_UK1 UNIQUE 

(

  S_PHONE 

, S_EMAIL 

)
```

### SUPPLY

```
CREATE TABLE SUPPLY 

(

  S_ID NUMBER(3, 0) NOT NULL 

, B_ID NUMBER(4, 0) NOT NULL 

, SUPPLY_DATE DATE NOT NULL 

, P_ID NUMBER(5, 0) NOT NULL 

);



ALTER TABLE SUPPLY

ADD CONSTRAINT SUPPLY_FK1 FOREIGN KEY

(

  S_ID 

)

REFERENCES SUPPLIER

(

  S_ID 

);



ALTER TABLE SUPPLY

ADD CONSTRAINT SUPPLY_FK2 FOREIGN KEY

(

  B_ID 

)

REFERENCES BATCH

(

  B_ID 

);



ALTER TABLE SUPPLY

ADD CONSTRAINT SUPPLY_FK3 FOREIGN KEY

(

  P_ID 

)

REFERENCES PRODUCT

(

  P_ID 

);
```

If you have done Java before, then you might know that everything is encapsulated inside a so-called **`class`**. In PL/SQL, code is encapsulated inside so-called **`blocks`**. There are two types of **`blocks`**: one is called an anonymous block, while the other is called a **`named block`**. As the name suggests, the anonymous block does not have a name and thus can’t be reused later (it can’t be saved inside the database), while the named block can be referred to later (as we move on, we will come across things like **`procedures`**, **`functions`**, and **`packages`**).

Let’s start with an anonymous block.

Here’s a syntax for a proper anonymous block:

```
DECLARE

  Declaration Statements 

 BEGIN

  Executable statements

 Exception 

  Exception handling statements

 END;
```

Here **`DECLARE`** is used to declare variables. Here’s an example:

```
 DECLARE

   V_NAME VARCHAR2(30);

   V_ID NUMBER(6);

   V_PHONE NUMBER(10);

   V_CONSTANT	CONSTANT NUMBER:=0;
```

**NOTE:** Here we use `:=` to assign a value to a variable. In most of the languages, we use `=` only.

Execution Section starts with **`BEGIN`**

```
 BEGIN

  SELECT E_NAME, E_ID, E_PHONE INTO V_NAME, V_ID, V_PHONE

  FROM EMPLOYEE WHERE E_ID = 100;

  DBMS_OUTPUT.PUT_LINE('Employee Name '||V_NAME||' '||V_ID ||' '||V_PHONE);

 END;
```

**NOTE:** To assign the variables value from the table we can use **`INTO`**.

In the end we can also add an exception-handling block. Here’s an example:

```
EXCEPTION 

  WHEN NO_DATA_FOUND THEN

  DBMS_OUTPUT.PUT_LINE ('No Employee Found with '||V_ID);
```

**NOTE:** The Exception block is optional — you can leave it out. In that case, the system will raise an exception itself (which is obviously not user-friendly).

Whenever you want to display data to the user using values from the database, you first have to run one statement in particular.

**`SET SERVEROUTPUT ON`**

This takes us to a very interesting topic which is totally out of scope for this blog post. So if you really want to know about it, ask your DBMS professor or message me on Twitter or Facebook.

Whenever you want to store a value in a variable, you first need to give it a data type. It is best practice to make sure that you have given the correct data type to each variable. Let me give you an example.

```
DECLARE

 V_Name VARCHAR2(15);

BEGIN

 SELECT E_NAME INTO V_Name FROM EMPLOYEE WHERE E_ID = 1005;



END;
```

In this code, E_NAME is 30 bytes (VARCHAR2(30)) but V_Name can only store 15 bytes. So we will not get the desired value. This is exactly what the **`anchored datatype (%TYPE)`** is for.

Here’s the syntax:

```
variable_name typed-attribute%type
```

So if I rewrite my previous code snippet it will be something like this:

```
DECLARE

 V_Name EMPLOYEE.E_NAME%TYPE;

BEGIN

 SELECT E_NAME INTO V_Name FROM EMPLOYEE WHERE E_ID = 1005;

END;
```

IF-THEN-ELSIF Control Statements in PL/SQL

Here’s the syntax:

```
IF CONDITION 1 THEN

  STATEMENT 1;

 ELSIF CONDITION 2 THEN

  STATEMENT 2;

 ELSIF CONDITION 3 THEN

  STATEMENT 3;

  ...

 ELSE

  STATEMENT N;

 END IF;
```

Similarly we have LOOP

Here’s the syntax:

```
LOOP

  Statement 1;

  Statement 2;

  …

  Statement 3;

 END LOOP;
```

CASE in PL/SQL

Here’s the syntax:

```
CASE [ expression ] 

   WHEN condition_1 THEN 

      result_1 

   WHEN condition_2 THEN 

      result_2 ... 

   WHEN condition_n THEN 

      result_n ELSE result 

END CASE;
```

Here’s an example of how to take a number from the user and determine whether it is even or odd.

```
SET SERVEROUTPUT ON;

DECLARE

    VALUE1 NUMBER:= &NUMBER1;  

    REMAINDER1 NUMBER;

BEGIN

    REMAINDER1 := MOD(VALUE1, 2);

    CASE REMAINDER1

        WHEN 0 THEN

            DBMS_OUTPUT.PUT_LINE('EVEN NUMBER');

        WHEN 1 THEN

            DBMS_OUTPUT.PUT_LINE('ODD NUMBER');

        END CASE;

END;
```

Here’s another example, in which you can find the day of the week on which you were born.

```
SET SERVEROUTPUT ON;

DECLARE

    V_DATE DATE:= TO_DATE('&BIRTHDAY', 'DD-MON-YYYY');

    V_DAY VARCHAR2(20);

BEGIN

    V_DAY:=TO_CHAR(V_DATE,'D');

    CASE V_DAY

        WHEN '1' THEN

            DBMS_OUTPUT.PUT_LINE('SUNDAY');

        WHEN '2' THEN

            DBMS_OUTPUT.PUT_LINE('MONDAY');

        WHEN '3' THEN

            DBMS_OUTPUT.PUT_LINE('TUESDAY');

        WHEN '4' THEN

            DBMS_OUTPUT.PUT_LINE('WEDNESDAY');

        WHEN '5' THEN

            DBMS_OUTPUT.PUT_LINE('THURSDAY');

        WHEN '6' THEN

            DBMS_OUTPUT.PUT_LINE('FRIDAY');

        WHEN '7' THEN

            DBMS_OUTPUT.PUT_LINE('SATURDAY');

        END CASE;        

END;
```

Now sometimes we want to auto-increment a few values which are generally primary keys. In Oracle, we don’t have **`AUTO_INCREMENT`**. Instead, we can use a **`SEQUENCE`**. Here’s the syntax for a sequence:

```
CREATE SEQUENCE sequence_name MINVALUE value 

MAXVALUE value 

START WITH value 

INCREMENT BY value 

CACHE value;
```

In case you don’t provide **`MAXVALUE`**, it defaults to 999999999999999999999999999.

Here’s an example to create a sequence for P\_ID.

```
CREATE SEQUENCE P_SEQUENCE

START WITH 10006

INCREMENT BY 1;

/

INSERT INTO PRODUCT (P_ID, P_NAME, P_PRICE, B_ID, P_QTY) VALUES (P_SEQUENCE.NEXTVAL, 'FORMAL PANTS', 2000, 1009, 20);
```

Also, we can make temporary tables called **`VIEWs`** to hold data temporarily. Generally, a view is used to combine data from two or more tables and run a query on the resultant table to get the desired output.

**Let’s create a view for finding the average sale between two dates given by the user.**

Here’s the code:

```
CREATE OR REPLACE VIEW TEMP_SALES_PRODUCT AS

SELECT P_ID,  SUM(PUR_QTY) T_QTY, SUM(PUR_QTY * (SELECT P_PRICE FROM PRODUCT WHERE PRODUCT.P_ID = SALES.P_ID)) T_PRICE, PUR_DATE FROM SALES GROUP BY PUR_DATE,P_ID;
```

Now we can use **`LOOP`** to loop between the date provided by the user.

Here’s the code:

```
SET SERVEROUTPUT ON;

DECLARE

    L_DATE DATE:= TO_DATE('&DATE_VALUE1', 'DD-MON-YYYY');

    E_DATE DATE:= TO_DATE('&DATE_VALUE2', 'DD-MON-YYYY');

    C1 NUMBER;

BEGIN

    LOOP

        SELECT AVG(T_PRICE) INTO C1 FROM TEMP_SALES_PRODUCT WHERE PUR_DATE = L_DATE;

        DBMS_OUTPUT.PUT_LINE('AVERAGE PURCHASE PRICE ON ' || L_DATE || ' = ' || C1);

        L_DATE:=L_DATE+1;

        EXIT WHEN L_DATE > E_DATE;

    END LOOP;

END;
```

As an exercise, you can try this:

**Take input from the user to accept as many supplier details as they want.**

I guess this is too much to take in in one go. So I will stop here. In the next post we will talk about **`cursors, procedures, functions, and triggers`**. And that will be the last blog post of **\[Training\] DBMS with Oracle**.
