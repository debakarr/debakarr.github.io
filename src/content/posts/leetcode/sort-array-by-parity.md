---
title: "[LeetCode] 905. Sort Array By Parity"
date: "2019-06-17"
description: "Sort Array By Parity Link to original Problem on LeetCode Given an array A of non-negative integers, return an array consisting of all the even elements of A, followed by all the odd elements of A. You may return any answer array that satisfies this condition. Example 1: Input: [3,1,2,4] Output: [2,4,3,1] The outputs [4,2,3,1], [2,4,1,3], and [4,2,1,3] would also be accepted. Note: 1 <= A.length <= 5000 0 <= A[i] <= 5000"
categories: ["Programming", "Algorithms", "LeetCode"]
tags: ["Sort Array by Parity", "Two Pointers", "Array", "LeetCode", "Algorithm"]
draft: false
---

### Sort Array By Parity

[Link to original Problem on LeetCode](https://leetcode.com/problems/sort-array-by-parity/)

Given an array A of non-negative integers, return an array consisting of all the even elements of A, followed by all the odd elements of A.

You may return any answer array that satisfies this condition.

**Example 1:**

> Input: \[3,1,2,4\] Output: \[2,4,3,1\] The outputs \[4,2,3,1\], \[2,4,1,3\], and \[4,2,1,3\] would also be accepted.

**Note:**

> 1 <= A.length <= 5000 0 <= A\[i\] <= 5000

**Company:** *Amazon*, *Google*, *Microsoft*, *Adobe*, *Yahoo*

**Solution:**

```python
class Solution(object):
    def sortArrayByParity(self, A):
        """
        :type A: List[int]
        :rtype: List[int]
        """
        # Keep a pointer to the index with which the even number can be swap
        # For start it will be 0, since we want even numbers first
        index = 0
        
        
        for i, num in enumerate(A):
            # If we get a even number swap it with the value in index position
            # Then increament the index to point to the next index 
            # which can be used for swap
            if num % 2 == 0:
                A[i], A[index] = A[index], A[i]
                index += 1
        
        # Now after every element is swaped, we can return the array
        return A
```
