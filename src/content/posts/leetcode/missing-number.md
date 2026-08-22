---
title: "[LeetCode] 268. Missing Number"
date: "2019-06-17"
description: "Missing Number Link to original Problem on LeetCode Given an array containing n distinct numbers taken from 0, 1, 2, …, n, find the one that is missing from the array. Example 1: Input: [3,0,1] Output: 2 Example 2: Input: [9,6,4,2,3,5,7,0,1] Output: 8 Note: Your algorithm should run in linear runtime complexity. Could you implement it using only constant extra space complexity? Company: Amazon, Google Solution 1 (Using XOR): class Solution(object): def missingNumber(self, nums): \"\"\" :type nums: List[int] :rtype: int \"\"\" # We know XOR of same number is 0 # We also know that len(nums) is present in the list # iff it is not the number which is absent # So we keep len(nums) in result result = len(nums) # Then we loop through each number # and XOR the result with index and number for i, num in enumerate(nums): result ^= i result ^= num # By the end the absent number will be present in result return result Solution 2 (Using Sum):"
categories: ["Programming", "Algorithms", "LeetCode"]
tags: ["Missing Number", "Math", "Array", "LeetCode", "Algorithm"]
draft: false
---

### Missing Number

[Link to original Problem on LeetCode](https://leetcode.com/problems/missing-number/)

Given an array containing n distinct numbers taken from 0, 1, 2, …, n, find the one that is missing from the array.

**Example 1:**

> Input: \[3,0,1\] Output: 2

**Example 2:**

> Input: \[9,6,4,2,3,5,7,0,1\] Output: 8

**Note:**

Your algorithm should run in linear runtime complexity. Could you implement it using only constant extra space complexity?

**Company:** *Amazon*, *Google*

**Solution 1 (Using XOR):**

```python
class Solution(object):
    def missingNumber(self, nums):
        """
        :type nums: List[int]
        :rtype: int
        """
        # We know XOR of same number is 0
        # We also know that len(nums) is present in the list
        # iff it is not the number which is absent
        # So we keep len(nums) in result
        result = len(nums)
        
        # Then we loop through each number 
        # and XOR the result with index and number
        for i, num in enumerate(nums):
            result ^= i
            result ^= num
             
        # By the end the absent number will be present in result
        return result
```

**Solution 2 (Using Sum):**

```python
class Solution(object):
    def missingNumber(self, nums):
        """
        :type nums: List[int]
        :rtype: int
        """
        # We can use the same code we used when doing the problem with XOR
        # We just need to replace the XOR symbols with - and plus
        # We know inside loop if we add index with sum,
        # we will end us getting sum from 0 to n-1
        # So initially we keep n in sum
        sum = len(nums)
        
        for i, num in enumerate(nums):
            # Inside loop we are subtracting each number we saw
            # and adding the index
            sum -= num
            sum += i
              
        # Finally the sum will contain the number with is absent
        return sum
        # This can also be done in one line (Using Python 2):
        # return sum(range(len(nums) + 1)) - sum(nums)
```

This can also be solved using Binary Search but then we will have a time complexity of O(n log n).
