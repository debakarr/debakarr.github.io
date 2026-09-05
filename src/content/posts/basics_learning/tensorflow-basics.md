---
title: "TensorFlow Basic"
date: "2018-01-26"
description: "A beginner-friendly revision notebook for TensorFlow 1.x: constants, sessions, operations, placeholders, and basic matrix math."
categories: ["Programming", "Machine Learning", "Python"]
tags: ["TensorFlow", "Basics", "Machine Learning", "Python", "Tutorial"]
draft: false
---

![](https://i.imgur.com/LGi8Wxy.png)

# TensorFlow Basic

*I made this post for revision purposes.* This post contains most of the TensorFlow basics and how they work. Most of the code is beginner friendly. There is no need for prerequisite programming knowledge of TensorFlow to go through this notebook, but you should have a basic understanding of Python and how arrays work in general (and if you know a bit of AI, that would be great).

*Note: this post uses the TensorFlow 1.x API (`tf.Session`, `tf.placeholder`), which was current when it was written in 2018.*

The unit of data in TensorFlow is called a **tensor**. A tensor is, basically speaking, a multidimensional array (though it is not exactly that, but from a beginner's perspective it looks like one). Each tensor has something called **rank**, which is its number of dimensions (an example of this is given in the next section).

So first of all, at the very beginning we need to import TensorFlow to work with the classes, methods, and symbols associated with it. Below is the code (the typical way to import a library in Python).

```python
import tensorflow as tf
```

Now we can use all TensorFlow’s classes, methods, and symbols

### Constants

Let’s create a very basic constant. For this, TensorFlow uses what it calls a **tensor object**.

```python
tf.constant('Hello World')
```

```
<tf.Tensor 'Const:0' shape=() dtype=string>
```

This is a fundamental String constant. We can also save this as a variable.

```python
hello = tf.constant('Hello World')
```

Let’s see its type:

```python
type(hello)
```

```
tensorflow.python.framework.ops.Tensor
```

See, at the very end, we have ‘Tensor’, indicating that it’s an object of Tensor.

We can also create integer constant or float constant.

```python
a = tf.constant(2)

# we can explicitly pass in the data type of the constant
x = tf.constant(3.5, dtype=tf.float32)

# or TensorFlow can infer tf.float32 implicitly
y = tf.constant(5.0)
```

Let’s again check the type.

```python
type(a)
```

```
tensorflow.python.framework.ops.Tensor
```

```python
type(x)
```

```
tensorflow.python.framework.ops.Tensor
```

```python
type(y)
```

```
tensorflow.python.framework.ops.Tensor
```

Do you want to print the constants? Let’s try.

```python
print(a, x, y)
```

```
Tensor("Const_2:0", shape=(), dtype=int32) Tensor("Const_3:0", shape=(), dtype=float32) Tensor("Const_4:0", shape=(), dtype=float32)
```

What just happened? Notice this print does not print:

```python
2 3.5 5.0
```

The thing is that each of the objects (sometimes called nodes) will only be evaluated inside a so-called **session**. A session is something that encapsulates the state and controls the TensorFlow runtime. In other words (a bit technical), a session encapsulates the environment in which operation objects are executed. Tensor objects are evaluated inside those operation objects.

### Session

To create a session, we use the Session class. We can do it this way.

```python
sess = tf.Session()
```

Now to evaluate nodes inside a session, we must run something called a **computational graph**.

First, let’s talk about the computational graph in general. The computational graph is basically everywhere in computer science. Think of this statement:

**e=(a+b)∗(b+1)**

Here we can see that we have 3 operations, 2 addition and 1 multiplication and the computational graph can be visualized in this manner:

![](https://i.imgur.com/YACuVLV.png)

For more please go through the Computational graph part in [this article](http://colah.github.io/posts/2015-08-Backprop/)

Now if we run a computational graph in a session we will have the desired output. For this, we can use *run()* method.

```python
print(sess.run([a, x, y]))
```

```
[2, 3.5, 5.0]
```

If we check the type of a tensor object returned by sess.run() we can see that it’s now evaluated as a numpy array.

```python
type(sess.run(a))
```

```
numpy.int32
```

```python
type(sess.run(x))
```

```
numpy.float32
```

Let’s do the same thing with string constant we created earlier.

```python
sess.run(hello)
```

```
b'Hello World'
```

In the above output, ‘b’ indicates that the string is a bytestring. We can check this:

```python
type(sess.run(hello))
```

```
bytes
```

Some extra note: TensorFlow converts str to bytes in most places, including *sess.run()*. When using print with the string constant we get:

```python
print(sess.run(hello))
```

```
b'Hello World'
```

which is not the desired output. We are getting ‘b’ in front of the string (this is because its type is bytes, not str). To get the actual string you can use the *decode()* method like this:

```python
print(sess.run(hello).decode())
```

```
Hello World
```

### Operation

Let’s now move to Operations.

We can do multiple operations which includes addition, subtraction, multiplication, division, etc.

```python
x = tf.constant(4)
y = tf.constant(5)
```

```python
with tf.Session() as sess:
    print('Operations on', sess.run(x), 'and', sess.run(y), ':')
    print('Addition:', sess.run(x+y))
    print('Subtraction:', sess.run(x-y))
    print('Multiplication:', sess.run(x*y))
    print('Division:', sess.run(x/y))
```

```
Operations on 4 and 5 :
Addition: 9
Subtraction: -1
Multiplication: 20
Division: 0.8
```

### Placeholder

It’s not like we are always going to work with constants. TensorFlow has another type of object called a **placeholder** which can accept a value, after which we can perform an operation on that value. To create a placeholder we use *tf.placeholder()*. Inside the parentheses, you can put the datatype (the tensor’s object type) you want the placeholder to hold.

```python
x = tf.placeholder(tf.int32)
y = tf.placeholder(tf.int32)
```

Other than this there are a bunch of other placeholders. If you are using iPython, then you can explore those by typing ’tf.int’ or ’tf.float’ followed by *tab*.

```python
x
```

```
<tf.Tensor 'Placeholder:0' shape=<unknown> dtype=int32>
```

```python
y
```

```
<tf.Tensor 'Placeholder_1:0' shape=<unknown> dtype=int32>
```

We can see that these are placeholders and the initial shape is unknown, as they don’t hold anything yet.

```python
type(x)
```

```
tensorflow.python.framework.ops.Tensor
```

```python
type(y)
```

```
tensorflow.python.framework.ops.Tensor
```

We can also define operations using TensorFlow. Below we have 4 operations TensorFlow provides: tf.add, tf.subtract, tf.divide, tf.multiply. Other than these we have a bunch of other operations (which obviously include matrix operations) inside TensorFlow.

If you have worked with *lambda* before then, this might seem a bit similar to you where we are defining two parameters first and then the operation to be performed on them.

```python
add = tf.add(x, y)
sub = tf.subtract(x, y)
mul = tf.multiply(x, y)
div = tf.divide(x, y)
```

To evaluate these operations inside run we can use something called a feed_dict argument. Basically, the run method accepts an operation followed by a feed dictionary, which tells it on what values to perform the operations. Below we have 4 dictionaries containing different values for x and y (key-value pair format).

```python
d1 = {x:5, y:6}
d2 = {x:2, y:8}
d3 = {x:7, y:2}
d4 = {x:9, y:5}
```

Now we can do operation using the placeholder.

```python
with tf.Session() as sess:
    print('Operations with placeholders:')
    print('Addition:', sess.run(add, feed_dict=d1))
    print('Subtraction:', sess.run(sub, feed_dict=d2))
    print('Multiplication:', sess.run(mul, feed_dict=d3))
    print('Division:', sess.run(div, feed_dict=d4))
```

```
Operations with placeholders:
Addition: 11
Subtraction: -6
Multiplication: 14
Division: 1.8
```

Before ending this let’s look at how we are going to do operations on matrices at a very basic level. First we will have to import numpy to create arrays. Then we will perform an operation on those arrays.

```python
import numpy as np
```

```python
# Two arrays, one of dimension 2 by 3 and the other of dimension 3 by 2
a = np.array([[6.0, 6.0, 6.0], [2.0, 2.0, 2.0]])
b = np.array([[5.0, 10.0], [5.0, 10.0], [5.0, 10.0]])
```

```python
a.shape
```

```
(2, 3)
```

```python
b.shape
```

```
(3, 2)
```

```python
# Creating TensorFlow constants
mat1 = tf.constant(a)
mat2 = tf.constant(b)
```

```python
# defining operation
matrixMul = tf.matmul(mat1, mat2)
```

```python
# Creating session and running
with tf.Session() as sess:
    print(sess.run(matrixMul))
```

```
[[  90.  180.]
 [  30.   60.]]
```

If you want to explore more, you could (if you are using iPython or an IDE) type ’tf.mat’ followed by *tab* to explore the other operations available for matrices.

Before ending, there is one fascinating thing which you might need in the future.

For those working with neural networks, this feature of numpy is quite handy when working with biases. Think of a CNN where we have weights (W) and an image matrix (X). We have an equation which looks something like this: **y = X.W + b**. Here the result of X.W and b have different shapes. Even so, we can add them using something called broadcasting.

Let’s look at a few examples

```python
p = np.array([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])
q = np.array([5.0])
```

```python
p * q
```

```
array([[  5.,  10.,  15.],
       [ 20.,  25.,  30.]])
```

Above, 5.0 is multiplied with every element. This feature is quite handy when dealing with situations where the dimensions of the parameters to perform operations on do not match.

Using the same feature in TensorFlow:

```python
x = np.array([[6.0], [6.0]])
```

```python
mat3 = tf.constant(x)
```

```python
with tf.Session() as sess:
    print(sess.run(matrixMul + x))
```

```
[[  96.  186.]
 [  36.   66.]]
```

These are some of the fundamental concepts of TensorFlow which one should know before starting to work with it.

#### What we did

-   We imported TensorFlow as tf.
    
-   You can create constants with TensorFlow just by passing to tf.constant whatever object you want to convert to a tensor so that TensorFlow can work with it.
    
-   You can run operations interactively in a session just by creating one with tf.Session(). Save it to a variable, and then you can run constants or operations on those constants. We looked at some very basic operations, such as just adding two numbers together.
    
-   Then we looked at placeholders, which let us create operations or functions that take feed dictionaries in which we put placeholder objects and later provide the actual constants we want to work with. So you can think of it as almost defining your own function, except in this case we are using built-in functions.
    
-   And then we combined those two ideas to create some matrices using numpy and defined them as Tensor objects. We called the built-in function matmul() and passed two matrix constants. This time there is no feed dictionary, as we are using constants.
    

*Thanks for reading*
